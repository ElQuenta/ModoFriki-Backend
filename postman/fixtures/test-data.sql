-- Datos fijos para las pruebas de API (Postman/newman) y E2E (Playwright).
-- SOLO para la DB desechable de docker-compose.test.yml. Nunca ejecutar contra Render.
-- Idempotente: se puede correr varias veces.
-- Contraseña de ambos usuarios: ModoFriki-Test-2026

INSERT INTO "User" ("id", "email", "emailNormalized", "username", "usernameNormalized", "passwordHash", "role", "status", "timezone", "updatedAt") VALUES
	('11111111-1111-4111-8111-111111111111', 'admin.test@modofriki.local', 'admin.test@modofriki.local', 'admin_test', 'admin_test', '$2b$12$zoI0mvh7dN42woHQ7M6PZeDmLG6j2VJ7QQFtxhtJROGL/z1ABP9ja', 'ADMIN', 'ACTIVE', 'America/La_Paz', now()),
	('22222222-2222-4222-8222-222222222222', 'lector.test@modofriki.local', 'lector.test@modofriki.local', 'lector_test', 'lector_test', '$2b$12$zoI0mvh7dN42woHQ7M6PZeDmLG6j2VJ7QQFtxhtJROGL/z1ABP9ja', 'BASIC', 'ACTIVE', 'America/La_Paz', now())
ON CONFLICT ("emailNormalized") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", "role" = EXCLUDED."role", "status" = 'ACTIVE', "deletedAt" = NULL;

INSERT INTO "WorkType" ("id", "name", "slug") VALUES
	('33333333-3333-4333-8333-333333333333', 'Manhwa', 'manhwa')
ON CONFLICT DO NOTHING;

INSERT INTO "Genre" ("id", "name", "slug") VALUES
	('44444444-4444-4444-8444-444444444444', 'Acción', 'accion')
ON CONFLICT DO NOTHING;

INSERT INTO "MediaAsset" ("id", "pathname", "url", "contentType", "sizeBytes", "width", "height", "createdById") VALUES
	('55555555-5555-4555-8555-555555555551', 'test/cover.png', 'https://placehold.co/600x900.png?text=Portada', 'image/png', 1000, 600, 900, '11111111-1111-4111-8111-111111111111'),
	('55555555-5555-4555-8555-555555555552', 'test/page-1.png', 'https://placehold.co/800x1200.png?text=Pagina+1', 'image/png', 1000, 800, 1200, '11111111-1111-4111-8111-111111111111'),
	('55555555-5555-4555-8555-555555555553', 'test/page-2.png', 'https://placehold.co/800x1200.png?text=Pagina+2', 'image/png', 1000, 800, 1200, '11111111-1111-4111-8111-111111111111')
ON CONFLICT DO NOTHING;

-- Una obra publicada (visible) y una en borrador (debe dar 404 al público).
INSERT INTO "Work" ("id", "title", "slug", "synopsis", "typeId", "publicationStatus", "releaseStatus", "coverAssetId", "createdById", "updatedById", "updatedAt", "publishedAt") VALUES
	('66666666-6666-4666-8666-666666666666', 'Obra de Prueba', 'obra-de-prueba', 'Sinopsis de la obra usada por las pruebas automáticas.', '33333333-3333-4333-8333-333333333333', 'PUBLISHED', 'ONGOING', '55555555-5555-4555-8555-555555555551', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', now(), now()),
	('66666666-6666-4666-8666-666666666667', 'Obra Borrador', 'obra-borrador', 'No debe verse en el catálogo público.', '33333333-3333-4333-8333-333333333333', 'DRAFT', 'ONGOING', NULL, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', now(), NULL)
ON CONFLICT DO NOTHING;

INSERT INTO "WorkGenre" ("id", "workId", "genreId") VALUES
	('88888888-8888-4888-8888-888888888888', '66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444')
ON CONFLICT DO NOTHING;

INSERT INTO "Chapter" ("id", "workId", "number", "title", "status", "createdById", "updatedById", "updatedAt", "publishedAt") VALUES
	('77777777-7777-4777-8777-777777777771', '66666666-6666-4666-8666-666666666666', 1, 'El comienzo', 'PUBLISHED', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', now(), now()),
	('77777777-7777-4777-8777-777777777772', '66666666-6666-4666-8666-666666666666', 2, 'La continuación', 'PUBLISHED', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO "ChapterPage" ("id", "chapterId", "assetId", "position") VALUES
	('99999999-9999-4999-8999-999999999991', '77777777-7777-4777-8777-777777777771', '55555555-5555-4555-8555-555555555552', 1),
	('99999999-9999-4999-8999-999999999992', '77777777-7777-4777-8777-777777777771', '55555555-5555-4555-8555-555555555553', 2),
	('99999999-9999-4999-8999-999999999993', '77777777-7777-4777-8777-777777777772', '55555555-5555-4555-8555-555555555552', 1)
ON CONFLICT DO NOTHING;
