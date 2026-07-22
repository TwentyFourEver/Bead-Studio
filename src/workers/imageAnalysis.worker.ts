import {
  analyzePatternImage,
  type ImageAnalysisOptions,
  type PatternAnalysisResult,
} from '../lib/imageAnalysis'

export interface ImageAnalysisWorkerImage {
  width: number
  height: number
  data: ArrayBuffer
}

export interface ImageAnalysisWorkerAnalyzeRequest {
  type: 'analyze'
  requestId: number
  image: ImageAnalysisWorkerImage
  options?: Partial<ImageAnalysisOptions>
}

export interface ImageAnalysisWorkerCancelRequest {
  type: 'cancel'
  requestId: number
}

export type ImageAnalysisWorkerRequest =
  | ImageAnalysisWorkerAnalyzeRequest
  | ImageAnalysisWorkerCancelRequest

export interface ImageAnalysisWorkerResultResponse {
  type: 'result'
  requestId: number
  result: PatternAnalysisResult
}

export interface ImageAnalysisWorkerErrorResponse {
  type: 'error'
  requestId: number
  message: string
}

export interface ImageAnalysisWorkerCancelledResponse {
  type: 'cancelled'
  requestId: number
}

export type ImageAnalysisWorkerResponse =
  | ImageAnalysisWorkerResultResponse
  | ImageAnalysisWorkerErrorResponse
  | ImageAnalysisWorkerCancelledResponse

interface WorkerPort {
  onmessage: ((event: MessageEvent<ImageAnalysisWorkerRequest>) => void) | null
  postMessage(message: ImageAnalysisWorkerResponse): void
}

const workerPort = self as unknown as WorkerPort
const pending = new Map<number, ReturnType<typeof setTimeout>>()
const cancelled = new Set<number>()

function postCancelled(requestId: number) {
  const response: ImageAnalysisWorkerCancelledResponse = { type: 'cancelled', requestId }
  workerPort.postMessage(response)
}

workerPort.onmessage = (event) => {
  const request = event.data
  if (request.type === 'cancel') {
    cancelled.add(request.requestId)
    const timer = pending.get(request.requestId)
    if (timer !== undefined) {
      clearTimeout(timer)
      pending.delete(request.requestId)
      postCancelled(request.requestId)
    }
    return
  }

  const previous = pending.get(request.requestId)
  if (previous !== undefined) clearTimeout(previous)
  cancelled.delete(request.requestId)
  const timer = setTimeout(() => {
    pending.delete(request.requestId)
    if (cancelled.delete(request.requestId)) {
      postCancelled(request.requestId)
      return
    }
    try {
      const result = analyzePatternImage(
        {
          width: request.image.width,
          height: request.image.height,
          data: new Uint8ClampedArray(request.image.data),
        },
        request.options,
      )
      if (cancelled.delete(request.requestId)) {
        postCancelled(request.requestId)
        return
      }
      const response: ImageAnalysisWorkerResultResponse = {
        type: 'result',
        requestId: request.requestId,
        result,
      }
      workerPort.postMessage(response)
    } catch (error) {
      const response: ImageAnalysisWorkerErrorResponse = {
        type: 'error',
        requestId: request.requestId,
        message: error instanceof Error ? error.message : 'No fue posible analizar la imagen.',
      }
      workerPort.postMessage(response)
    }
  }, 0)
  pending.set(request.requestId, timer)
}
