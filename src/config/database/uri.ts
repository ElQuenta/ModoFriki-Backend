// Regex instead of new URL(): it also works with multi-host Mongo URIs (h1:27017,h2:27017).

// Host part only (no user, password, path or query).
export const uriHost = (uri: string): string => {
	return uri.match(/^[^:]+:\/\/(?:[^/?#]*@)?([^/?#]*)/)?.[1] ?? "unknown host";
};

// Error message with any "//user:pass@" replaced by "//***@".
export const safeErrorMessage = (error: unknown): string => {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/\/\/[^/?#\s]*@/g, "//***@");
};
