-- =====================================================================
-- SEHIP - Actualización de una base de datos creada con una versión anterior
-- Agrega a la tabla usuario las columnas del cambio obligatorio de la contraseña temporal y de la
-- recuperación de contraseña por código. Una base creada con el sehip_base_de_datos.sql actual
-- ya las incluye y no necesita este script.
-- =====================================================================
USE sehip;

ALTER TABLE usuario
    ADD COLUMN debe_cambiar_contrasena  TINYINT(1)       NOT NULL DEFAULT 0 AFTER protegido,
    ADD COLUMN codigo_recuperacion_hash VARCHAR(255)     NULL AFTER debe_cambiar_contrasena,
    ADD COLUMN codigo_expira            DATETIME         NULL AFTER codigo_recuperacion_hash,
    ADD COLUMN intentos_codigo          TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER codigo_expira,
    ADD CONSTRAINT ck_usuario_debe_cambiar CHECK (debe_cambiar_contrasena IN (0, 1)),
    ADD CONSTRAINT ck_usuario_intentos CHECK (intentos_codigo <= 5);
