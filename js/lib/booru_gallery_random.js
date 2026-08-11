const UINT32_RANGE = 0x100000000;

export const RANDOM_UNIQUE_MISS_LIMIT = 4;

export function secureRandomUint32() {
	const values = new Uint32Array(1);
	globalThis.crypto.getRandomValues(values);
	return values[0];
}

function randomIndex(upperBound, randomUint32) {
	const acceptedRange = Math.floor(UINT32_RANGE / upperBound) * upperBound;
	let value;
	do value = randomUint32(); while (value >= acceptedRange);
	return value % upperBound;
}

export function secureShuffle(values, randomUint32 = secureRandomUint32) {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const target = randomIndex(index + 1, randomUint32);
		[result[index], result[target]] = [result[target], result[index]];
	}
	return result;
}

export function randomPostKey(post) {
	return `${String(post?.source || "").toLowerCase()}:${String(post?.postId ?? "")}`;
}

export function createRandomGallerySession() {
	let active = false;
	let scope = "";
	const seen = new Set();
	return {
		sync(nextActive, nextScope) {
			const normalizedActive = Boolean(nextActive);
			const normalizedScope = normalizedActive ? String(nextScope || "") : "";
			if (normalizedActive === active && normalizedScope === scope) return false;
			active = normalizedActive;
			scope = normalizedScope;
			seen.clear();
			return true;
		},
		take(posts) {
			if (!active) return posts;
			const result = [];
			for (const post of secureShuffle(posts)) {
				const key = randomPostKey(post);
				if (seen.has(key)) continue;
				seen.add(key);
				result.push(post);
			}
			return result;
		},
		get seenCount() { return seen.size; },
	};
}
