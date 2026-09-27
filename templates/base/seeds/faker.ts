import { en, Faker } from "@faker-js/faker";

export const createSeededFaker = (seed: number): Faker => {
  const instance = new Faker({ locale: [en] });
  instance.seed(seed);
  return instance;
};
