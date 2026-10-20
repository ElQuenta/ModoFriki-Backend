import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { CommentVoteRepository } from "../../src/repositories/community/comment-vote.repository";
import AppError from "../../src/utils/AppError";
import { fixture, comment, ids } from "../community/fakes";

test("transaction callback preserves Mongo error identity and labels so a driver can retry", async () => {
	const f = fixture();
	const transient = new mongoose.mongo.MongoServerError({ message: "private driver information" });
	transient.addErrorLabel("TransientTransactionError");
	f.comments.respond("findOneAndUpdate", transient, comment());
	f.votes.respond("findOneAndUpdate", { _id: ids.third, commentId: ids.root, userId: ids.author, value: 1 });
	let attempts = 0;
	f.session.withTransaction = async (operation) => {
		attempts++;
		try { return await operation(f.session); }
		catch (error) {
			assert.equal(error, transient); assert.ok(error instanceof mongoose.mongo.MongoServerError);
			assert.equal(error.hasErrorLabel("TransientTransactionError"), true);
			attempts++; return await operation(f.session);
		}
	};
	const result = await new CommentVoteRepository(f.dependencies).setVote({ commentId: ids.root, userId: ids.author, value: 1 });
	assert.equal(result.value, 1); assert.equal(attempts, 2); assert.deepEqual(f.lifecycle, ["start", "end"]);
});

test("exhausted transaction driver error is sanitized after callback, session always ends", async () => {
	const f = fixture();
	const transient = new mongoose.mongo.MongoServerError({ message: "driver credentials not public" });
	transient.addErrorLabel("TransientTransactionError");
	f.comments.respond("findOneAndUpdate", transient);
	let observed: unknown;
	f.session.withTransaction = async (operation) => {
		try { return await operation(f.session); } catch (error) { observed = error; throw error; }
	};
	await assert.rejects(new CommentVoteRepository(f.dependencies).setVote({ commentId: ids.root, userId: ids.author, value: 1 }),
		(error: unknown) => error instanceof AppError && error.statusCode === 500 && !error.message.includes("credentials"));
	assert.equal(observed, transient); assert.deepEqual(f.lifecycle, ["start", "end"]);
	assert.equal(f.votes.calls.length, 0);
});
