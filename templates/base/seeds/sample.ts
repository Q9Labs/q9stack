import {
  createArchivedSample,
  createDraftSample,
  createPublishedSample,
  decodeSampleId,
  type ArchivedSample,
  type DraftSample,
  type PublishedSample,
} from "../packages/core/src/index.js";
import { createSeededFaker } from "./faker.js";

export interface SampleFixtures {
  readonly draft: DraftSample;
  readonly published: PublishedSample;
  readonly archived: ArchivedSample;
}

const timestamp = (offset: number): string => {
  const base = Date.UTC(2026, 7, 23, 0, 0, 0);
  return new Date(base + offset * 60 * 60 * 1000).toISOString();
};

export const createSampleFixtures = (seed: number): SampleFixtures => {
  const faker = createSeededFaker(seed);
  const id = decodeSampleId(faker.string.uuid());
  const title = faker.lorem.words(3);

  return {
    archived: createArchivedSample(id, title, timestamp(2)),
    draft: createDraftSample(id, title),
    published: createPublishedSample(id, title, timestamp(1)),
  };
};
