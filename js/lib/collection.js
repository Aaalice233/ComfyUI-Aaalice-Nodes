/** Stable Collection protocol helpers for the user-facing Favorites model. */

export const DEFAULT_COLLECTION_ID = "00000000-0000-5000-8000-000000000001";
export const DEFAULT_COLLECTION_NAME = "Favorites";

export function isDefaultCollection(collection) {
	return collection?.id === DEFAULT_COLLECTION_ID;
}

export function collectionDisplayName(collection, defaultLabel = DEFAULT_COLLECTION_NAME) {
	if (!collection) return "";
	return isDefaultCollection(collection) && collection.name === DEFAULT_COLLECTION_NAME ? defaultLabel : collection.name;
}

export function collectionSelectOption(collection, defaultLabel = DEFAULT_COLLECTION_NAME, selected = false) {
	return new Option(collectionDisplayName(collection, defaultLabel), collection.id, false, selected);
}
