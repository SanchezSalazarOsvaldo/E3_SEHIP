-- =====================================================================
-- SEHIP - Datos de prueba de la tabla maestra normativa (PostgreSQL / Supabase)
-- Se ejecuta después de sehip_base_de_datos.sql.
-- Los valores son ilustrativos para probar el sistema de extremo a extremo;
-- se sustituyen por los valores normativos oficiales mediante RF-ADM-03.
-- =====================================================================

-- Coeficientes de escurrimiento: Cp (superficie permeable) y Ci (superficie impermeable).
UPDATE coeficiente_normativo SET valor = 0.20 WHERE tipo = 'Cp';
UPDATE coeficiente_normativo SET valor = 0.90 WHERE tipo = 'Ci';

-- Intensidad de lluvia (mm/h) por período de retorno, igual para las 16 alcaldías.
UPDATE intensidad_lluvia
   SET intensidad_mm_h = CASE periodo_retorno
                           WHEN 2  THEN 40.00
                           WHEN 5  THEN 55.00
                           WHEN 10 THEN 65.00
                           WHEN 20 THEN 75.00
                           WHEN 50 THEN 90.00
                         END;

-- Combinación sin intensidad registrada, para probar el flujo alterno 2 de RF-WEB-05.
UPDATE intensidad_lluvia
   SET intensidad_mm_h = NULL
 WHERE periodo_retorno = 50
   AND id_alcaldia = (SELECT id_alcaldia FROM alcaldia WHERE nombre = 'Milpa Alta');

-- Incidencias de prueba (puntos críticos de encharcamiento) para el mapa del panel de control (RF-ADM-02).
-- En operación normal las registra la aplicación móvil (RF-MOV-05).
INSERT INTO punto_critico (id_alcaldia, latitud, longitud, fecha_registro)
SELECT a.id_alcaldia, p.latitud, p.longitud, p.fecha
  FROM (VALUES
    ('Iztacalco',           19.411600, -99.062400, TIMESTAMP '2026-06-14 18:20:00'),
    ('Benito Juárez',       19.403200, -99.156900, TIMESTAMP '2026-06-21 19:05:00'),
    ('Iztapalapa',          19.359200, -99.104700, TIMESTAMP '2026-07-02 17:45:00'),
    ('Coyoacán',            19.343600, -99.140600, TIMESTAMP '2026-07-09 20:10:00'),
    ('Gustavo A. Madero',   19.498700, -99.120500, TIMESTAMP '2026-07-15 16:30:00'),
    ('Venustiano Carranza', 19.441700, -99.090100, TIMESTAMP '2026-07-22 18:55:00'),
    ('Tlalpan',             19.302000, -99.189000, TIMESTAMP '2026-08-03 19:40:00'),
    ('Tláhuac',             19.296000, -99.061000, TIMESTAMP '2026-08-11 17:15:00'),
    ('Iztapalapa',          19.387000, -99.054000, TIMESTAMP '2026-08-19 21:00:00'),
    ('Miguel Hidalgo',      19.459000, -99.188000, TIMESTAMP '2026-08-27 18:05:00'),
    ('Iztapalapa',          19.374000, -99.081000, TIMESTAMP '2026-09-04 19:25:00'),
    ('Xochimilco',          19.260000, -99.105000, TIMESTAMP '2026-09-12 16:50:00')
  ) AS p (alcaldia, latitud, longitud, fecha)
  JOIN alcaldia a ON a.nombre = p.alcaldia;
