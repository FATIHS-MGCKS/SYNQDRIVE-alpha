import { Injectable } from '@nestjs/common';
import type { ChunkedMatchInput, ChunkedMatchPipelineResult } from './trip-route-chunked-matching.types';
import { MapboxChunkMatchingClientService } from './mapbox-chunk-matching.client.service';
import { runChunkedMatchPipeline } from './trip-route-chunked-matcher';

@Injectable()
export class TripRouteChunkedMatcherService {
  constructor(private readonly mapboxClient: MapboxChunkMatchingClientService) {}

  async matchFilteredRoute(input: ChunkedMatchInput): Promise<ChunkedMatchPipelineResult> {
    return runChunkedMatchPipeline(input, this.mapboxClient);
  }
}
