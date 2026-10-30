import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const api = parse(readFileSync("openapi.yaml", "utf8"));
const dereference = value => value?.$ref ? value.$ref.split("/").slice(1).reduce((object, key) => object?.[key], api) : value;
let references = 0, operations = 0;
function visit(value) {
	if (!value || typeof value !== "object") return;
	if (value.$ref?.startsWith("#/")) { assert(dereference(value), `Unresolved reference ${value.$ref}`); references++; }
	Object.values(value).forEach(visit);
}
visit(api);
for (const [path, item] of Object.entries(api.paths)) {
	for (const method of ["get", "post", "put", "patch", "delete"]) {
		if (!item[method]) continue; operations++;
		const parameters = [...(item.parameters ?? []), ...(item[method].parameters ?? [])].map(dereference);
		for (const match of path.matchAll(/\{([^}]+)\}/g)) assert(parameters.some(p => p.in === "path" && p.name === match[1] && p.required), `${method} ${path}: missing ${match[1]}`);
	}
}
assert(api.paths["/api/comments"].post.parameters.some(p => p.name === "Idempotency-Key"));
const chapter = api.paths["/api/works/{workId}/chapters/{chapterId}"].get.responses["200"].content["application/json"].schema.properties.data;
assert.equal(chapter.$ref, "#/components/schemas/CatalogChapterDetail");
assert(!api.components.schemas.CatalogChapter.required.includes("readingImages"));
let details = 0;
function checkDetailRefs(value, path, method) {
	if (!value || typeof value !== "object") return;
	if (value.$ref === "#/components/schemas/CatalogChapterDetail") {
		assert.equal(path, "/api/works/{workId}/chapters/{chapterId}"); assert.equal(method, "get"); details++;
	}
	Object.values(value).forEach(item => checkDetailRefs(item, path, method));
}
for (const [path, item] of Object.entries(api.paths)) for (const method of ["get", "post", "put", "patch", "delete"]) checkDetailRefs(item[method], path, method);
assert.equal(details, 1);
console.log(JSON.stringify({ paths: Object.keys(api.paths).length, operations, references, status: "PASS" }));
