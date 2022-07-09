import { Stream, stream } from '../../stream/Stream';
import { Arbitrary } from '../arbitrary/definition/Arbitrary';
import { Value } from '../arbitrary/definition/Value';
import { IRawProperty } from '../property/IRawProperty';
import { Property } from '../property/Property.generic';
import { UnbiasedProperty } from '../property/UnbiasedProperty';
import { readConfigureGlobal } from './configuration/GlobalParameters';
import { Parameters } from './configuration/Parameters';
import { QualifiedParameters } from './configuration/QualifiedParameters';
import { toss } from './Tosser';
import { pathWalk } from './utils/PathWalker';

/** @internal */
function toProperty<Ts>(
  generator: IRawProperty<Ts> | Arbitrary<Ts>,
  qParams: QualifiedParameters<Ts>
): IRawProperty<Ts> {
  const prop = !Object.prototype.hasOwnProperty.call(generator, 'isAsync')
    ? new Property(generator as Arbitrary<Ts>, () => true)
    : (generator as IRawProperty<Ts>);
  return qParams.unbiased === true ? new UnbiasedProperty(prop) : prop;
}

/** @internal */
function streamSample<Ts>(
  generator: IRawProperty<Ts> | Arbitrary<Ts>,
  params?: Parameters<Ts> | number
): IterableIterator<Ts> {
  const extendedParams =
    typeof params === 'number'
      ? { ...(readConfigureGlobal() as Parameters<Ts>), numRuns: params }
      : { ...(readConfigureGlobal() as Parameters<Ts>), ...params };
  const qParams: QualifiedParameters<Ts> = QualifiedParameters.read<Ts>(extendedParams);
  const nextProperty = toProperty(generator, qParams);
  const shrink = nextProperty.shrink.bind(nextProperty);
  const tossedValues: Stream<() => Value<Ts>> = stream(
    toss(nextProperty, qParams.seed, qParams.randomType, qParams.examples)
  );
  if (qParams.path.length === 0) {
    return tossedValues.take(qParams.numRuns).map((s) => s().value_);
  }
  return stream(
    pathWalk(
      qParams.path,
      tossedValues.map((s) => s()),
      shrink
    )
  )
    .take(qParams.numRuns)
    .map((s) => s.value_);
}

/**
 * Generate an array containing all the values that would have been generated during {@link assert} or {@link check}
 *
 * @example
 * ```typescript
 * fc.sample(fc.nat(), 10); // extract 10 values from fc.nat() Arbitrary
 * fc.sample(fc.nat(), {seed: 42}); // extract values from fc.nat() as if we were running fc.assert with seed=42
 * ```
 *
 * @param generator - {@link IProperty} or {@link Arbitrary} to extract the values from
 * @param params - Integer representing the number of values to generate or `Parameters` as in {@link assert}
 *
 * @remarks Since 0.0.6
 * @public
 */
function sample<Ts>(generator: IRawProperty<Ts> | Arbitrary<Ts>, params?: Parameters<Ts> | number): Ts[] {
  return [...streamSample(generator, params)];
}

/** @internal */
function round2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Gather useful statistics concerning generated values
 *
 * Print the result in `console.log` or `params.logger` (if defined)
 *
 * @example
 * ```typescript
 * fc.statistics(
 *     fc.nat(999),
 *     v => v < 100 ? 'Less than 100' : 'More or equal to 100',
 *     {numRuns: 1000, logger: console.log});
 * // Classify 1000 values generated by fc.nat(999) into two categories:
 * // - Less than 100
 * // - More or equal to 100
 * // The output will be sent line by line to the logger
 * ```
 *
 * @param generator - {@link IProperty} or {@link Arbitrary} to extract the values from
 * @param classify - Classifier function that can classify the generated value in zero, one or more categories (with free labels)
 * @param params - Integer representing the number of values to generate or `Parameters` as in {@link assert}
 *
 * @remarks Since 0.0.6
 * @public
 */
function statistics<Ts>(
  generator: IRawProperty<Ts> | Arbitrary<Ts>,
  classify: (v: Ts) => string | string[],
  params?: Parameters<Ts> | number
): void {
  const extendedParams =
    typeof params === 'number'
      ? { ...(readConfigureGlobal() as Parameters<Ts>), numRuns: params }
      : { ...(readConfigureGlobal() as Parameters<Ts>), ...params };
  const qParams: QualifiedParameters<Ts> = QualifiedParameters.read<Ts>(extendedParams);
  const recorded: { [key: string]: number } = {};
  for (const g of streamSample(generator, params)) {
    const out = classify(g);
    const categories: string[] = Array.isArray(out) ? out : [out];
    for (const c of categories) {
      recorded[c] = (recorded[c] || 0) + 1;
    }
  }
  const data = Object.entries(recorded)
    .sort((a, b) => b[1] - a[1])
    .map((i) => [i[0], `${round2((i[1] * 100.0) / qParams.numRuns)}%`]);
  const longestName = data.map((i) => i[0].length).reduce((p, c) => Math.max(p, c), 0);
  const longestPercent = data.map((i) => i[1].length).reduce((p, c) => Math.max(p, c), 0);
  for (const item of data) {
    qParams.logger(`${item[0].padEnd(longestName, '.')}..${item[1].padStart(longestPercent, '.')}`);
  }
}

export { sample, statistics };
