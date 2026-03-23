"use client";

import { createFile } from "mp4box";
import type { MP4BoxBuffer } from "mp4box";

const CHUNK_SIZE = 512 * 1024; // 512KB

export interface MP4ClipResult {
  /** 클립된 영상 (fMP4, video+audio) — Railway /mux 전송용 */
  videoBlob: Blob;
  /** 오디오 전용 (fMP4 init + audio segments) — /api/dub STT용 */
  audioBlob: Blob;
}

/**
 * MP4/MOV 파일을 클라이언트에서 크롭합니다.
 *
 * 전략:
 *  1. 파일을 512KB 청크로 읽어 moov atom만 파싱 (5~20MB)
 *  2. seek(startTime) 로 키프레임 정렬 바이트 오프셋 획득
 *  3. 해당 오프셋부터 endTime 예상 오프셋까지만 읽음 (전체 파일 로드 없음)
 *  4. fMP4 세그먼트를 트랙별로 수집 → videoBlob / audioBlob 반환
 */
export async function clipMP4(
  file: File,
  startTime: number,
  clipDuration = 60,
): Promise<MP4ClipResult> {
  const endTime = startTime + clipDuration;

  return new Promise((resolve, reject) => {
    const mp4 = createFile();

    let videoTrackId = -1;
    let audioTrackId = -1;
    let totalDuration = 0;
    let seekOffset = 0;
    let ready = false;
    let resolved = false;

    let initBuffer: ArrayBuffer | null = null;
    const videoSegments: ArrayBuffer[] = [];
    const audioSegments: ArrayBuffer[] = [];

    const finish = () => {
      if (resolved) return;
      resolved = true;

      if (!initBuffer) {
        reject(new Error("초기화 세그먼트를 생성하지 못했습니다."));
        return;
      }

      // videoBlob: init + video segments
      const videoBlob = new Blob([initBuffer, ...videoSegments], {
        type: "video/mp4",
      });

      // audioBlob: init + audio segments (audio-only fMP4, ffmpeg이 audio 추출 가능)
      // audio segments가 없으면 videoBlob을 fallback으로 사용
      const audioBlob =
        audioSegments.length > 0
          ? new Blob([initBuffer, ...audioSegments], { type: "video/mp4" })
          : videoBlob;

      resolve({ videoBlob, audioBlob });
    };

    mp4.onReady = (info: any) => {
      const vTrack = info.tracks.find((t: any) => t.type === "video");
      const aTrack = info.tracks.find((t: any) => t.type === "audio");

      if (!vTrack) {
        reject(new Error("비디오 트랙을 찾을 수 없습니다."));
        return;
      }

      videoTrackId = vTrack.id;
      if (aTrack) audioTrackId = aTrack.id;
      totalDuration = info.duration / info.timescale;

      // 세그먼테이션 설정 (nbSamples 단위로 세그먼트 생성)
      mp4.setSegmentOptions(videoTrackId, null, {
        nbSamples: 30,
        rapAlignement: true,
      });
      if (audioTrackId !== -1) {
        mp4.setSegmentOptions(audioTrackId, null, { nbSamples: 100 });
      }

      // 초기화 세그먼트 (moov — 모든 트랙 정보 포함)
      const initSeg = mp4.initializeSegmentation();
      initBuffer = initSeg.buffer;

      // startTime 키프레임 정렬 오프셋 획득
      const seekResult = mp4.seek(startTime, true);
      seekOffset = seekResult.offset;
      ready = true;

      mp4.start();
    };

    mp4.onSegment = (
      id: number,
      _user: unknown,
      buffer: ArrayBuffer,
      _nextSample: number,
      last: boolean,
    ) => {
      if (resolved) return;
      if (id === videoTrackId) videoSegments.push(buffer);
      else if (id === audioTrackId) audioSegments.push(buffer);
      if (last) finish();
    };

    mp4.onError = (e: string) => reject(new Error(`MP4Box 오류: ${e}`));

    const run = async () => {
      let offset = 0;

      // Phase 1: moov 파싱 — onReady 발화까지 청크 전송
      while (!ready && offset < file.size) {
        const buf = await readChunk(file, offset);
        const next = mp4.appendBuffer(buf);
        // appendBuffer가 다음 필요 오프셋을 반환하면 활용, 아니면 순차 진행
        offset =
          typeof next === "number" && next > offset ? next : offset + CHUNK_SIZE;
      }

      if (!ready) {
        reject(new Error("MP4 파일을 파싱할 수 없습니다."));
        return;
      }

      // Phase 2: seekOffset ~ endTime 예상 오프셋 구간만 전송
      // 전체 파일을 로드하지 않기 위해 bitrate 기반으로 endOffset 추정 (+20% 여유)
      const endOffset =
        totalDuration > 0
          ? Math.min(
              file.size,
              seekOffset +
                Math.ceil((file.size / totalDuration) * clipDuration * 1.2),
            )
          : file.size;

      offset = seekOffset;
      while (offset < endOffset && !resolved) {
        const buf = await readChunk(file, offset);
        mp4.appendBuffer(buf);
        offset += CHUNK_SIZE;
        // 이벤트 루프에 onSegment 콜백 기회 부여
        await tick();
      }

      // 남은 버퍼 플러시 → 마지막 세그먼트 emit
      mp4.flush();

      // flush 후에도 onSegment(last=true)가 오지 않으면 타임아웃으로 마무리
      await new Promise<void>((r) => setTimeout(r, 300));
      finish();
    };

    run().catch(reject);
  });
}

async function readChunk(file: File, offset: number): Promise<MP4BoxBuffer> {
  const end = Math.min(offset + CHUNK_SIZE, file.size);
  const buf = (await file.slice(offset, end).arrayBuffer()) as MP4BoxBuffer;
  buf.fileStart = offset;
  return buf;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
