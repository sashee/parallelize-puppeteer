const rxjs = require("rxjs");
const operators = require("rxjs/operators");

module.exports.orderedMergeMap = (mapper, concurrency) => rxjs.pipe(
	operators.mergeMap(async (input, index) => [await mapper(input), index], concurrency), 
	operators.scan(({lastEmittedIndex, results}, [result, idx]) => {
		const emit = [...results, {result, index: idx}].map((result, _, list) => [
			result,
			[...Array(result.index - lastEmittedIndex - 1).keys()].map((i) => i + lastEmittedIndex + 1)
				.every((i) => list.find(({index}) => index === i) !== undefined)
		]);
		
		return {
			emitting: emit
				.filter(([result, emit]) => emit)
				.map(([result]) => result)
				.sort((a, b) => a.index - b.index)
				.map(({result}) => result),
			lastEmittedIndex: Math.max(
				lastEmittedIndex,
				...emit.filter(([result, emit]) => emit).map(([{index}]) => index)
			),
			results: emit
				.filter(([result, emit]) => !emit)
				.map(([result]) => result),
		}; 
	}, {emitting: [], lastEmittedIndex: -1, results: []}),
	operators.flatMap(({emitting}) => emitting)
)
