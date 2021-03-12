import * as fc from '../../../../lib/fast-check';

import { frequency } from '../../../../src/check/arbitrary/FrequencyArbitrary';
import { integer } from '../../../../src/check/arbitrary/IntegerArbitrary';
import { constant } from '../../../../src/check/arbitrary/ConstantArbitrary';

import * as genericHelper from './generic/GenericArbitraryHelper';

describe('FrequencyArbitrary', () => {
  describe('frequency', () => {
    const seedGenerator = fc.record(
      {
        data: fc
          .array(
            fc.record({
              type: fc.constantFrom('unique', 'range'),
              value: fc.nat(),
              weight: fc.nat(),
            }),
            { minLength: 1 }
          )
          .filter((config) => {
            const totalWeight = config.reduce((acc, e) => acc + e.weight, 0);
            return totalWeight > 0;
          }),
        constraints: fc.record(
          {
            withCrossShrink: fc.boolean(),
            depthFactor: fc.double({ min: 0, max: Number.MAX_VALUE, noNaN: true }),
            maxDepth: fc.nat(),
          },
          { requiredKeys: [] }
        ),
      },
      { requiredKeys: ['data'] }
    );
    type SeedGeneratorType = typeof seedGenerator extends fc.Arbitrary<infer T> ? T : never;

    genericHelper.isValidArbitrary(
      (metas: SeedGeneratorType) => {
        const arbs = metas.data.map((m) =>
          m.type === 'unique'
            ? { arbitrary: constant(m.value), weight: m.weight }
            : { arbitrary: integer(m.value - 10, m.value), weight: m.weight }
        );
        if (metas.constraints === undefined) {
          return frequency(...arbs);
        }
        return frequency(metas.constraints, ...arbs);
      },
      {
        seedGenerator,
        isValidValue: (v: number, metas: SeedGeneratorType) => {
          // If maxDepth is 0, then only the first arbitrary can be called
          const data =
            metas.constraints !== undefined && metas.constraints.maxDepth === 0 ? [metas.data[0]] : metas.data;
          for (const m of data) {
            if (m.weight === 0) continue;
            if (m.type === 'unique' && m.value === v) return true;
            if (m.type === 'range' && m.value - 10 <= v && v <= m.value) return true;
          }
          return false;
        },
        isStrictlySmallerValue: (a: number, b: number, metas: SeedGeneratorType) => {
          // When withCrossShrink is toggled, the shrinker can jump from one arbitrary to the first one on shrink
          // But only if the weight associated to the first arbitrary is strictly greater than 0
          if (metas.constraints !== undefined && metas.constraints.withCrossShrink && metas.data[0].weight > 0) {
            const canBeInFirstArbitrary =
              metas.data[0].type === 'unique'
                ? metas.data[0].value === a
                : metas.data[0].value - 10 <= a && a <= metas.data[0].value;
            if (canBeInFirstArbitrary) {
              // `a` is possibly coming from our first arbitrary
              return true;
            }
          }
          // Otherwise, shrinks are always coming from the arbitrary itself
          return Math.abs(b - a) <= 10 && b > 0 ? b - a > 0 : b - a < 0;
        },
      }
    );
  });
});