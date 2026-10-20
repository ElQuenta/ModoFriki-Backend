import { describe, expect, it } from "vitest";
import type Joi from "joi";
import { loginBodySchema, registerBodySchema } from "../auth.schema";

const ok = (schema: Joi.Schema, input: unknown) => {
	const { error, value } = schema.validate(input, { abortEarly: false, convert: true });
	expect(error).toBeUndefined();
	return value;
};
const bad = (schema: Joi.Schema, input: unknown) => expect(schema.validate(input, { convert: true }).error).toBeDefined();

const register = { username: "alan", email: "alan@example.com", password: "password123" };

describe("registerBodySchema", () => {
	it("accepts a valid body and trims strings", () => {
		expect(ok(registerBodySchema, { ...register, username: "  alan  ", email: " alan@example.com ", timezone: "America/La_Paz" }))
			.toEqual({ ...register, timezone: "America/La_Paz" });
	});

	it.each([
		["missing username", { email: register.email, password: register.password }],
		["missing email", { username: "alan", password: register.password }],
		["missing password", { username: "alan", email: register.email }],
		["short username", { ...register, username: "ab" }],
		["long username", { ...register, username: "a".repeat(33) }],
		["invalid email", { ...register, email: "nope" }],
		["short password", { ...register, password: "1234567" }],
		["password over 72 bytes", { ...register, password: "ñ".repeat(37) }],
		["numeric username", { ...register, username: 12345 }],
		["timezone with offset", { ...register, timezone: "+04:00" }],
		["timezone with spaces", { ...register, timezone: "La Paz" }],
		["unknown key", { ...register, role: "ADMIN" }],
		["undefined body", undefined]
	])("rejects %s", (_name, input) => bad(registerBodySchema, input));
});

describe("loginBodySchema", () => {
	it("accepts a valid body", () => {
		expect(ok(loginBodySchema, { email: register.email, password: register.password })).toEqual({ email: register.email, password: register.password });
	});

	it.each([
		["missing email", { password: register.password }],
		["missing password", { email: register.email }],
		["invalid email", { email: "x@", password: register.password }],
		["short password", { email: register.email, password: "short" }],
		["unknown key", { email: register.email, password: register.password, username: "alan" }]
	])("rejects %s", (_name, input) => bad(loginBodySchema, input));
});
