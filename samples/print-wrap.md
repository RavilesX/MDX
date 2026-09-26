# Prueba de wrap en PDF

Exportar a PDF y revisar que no se corte nada.

## JSON en una sola línea larga

```json
{"clave_muy_larga_numero_uno": "valor extremadamente largo que no cabe en la pagina", "otra_clave": "otro valor bastante largo para forzar el desborde", "otra": "FIN_DE_LINEA_CODIGO"}
```

## SQL con líneas largas

```sql
SELECT u.id, u.nombre, u.apellido, u.correo_electronico, p.descripcion_del_pedido, p.fecha_de_creacion, p.monto_total FROM usuarios u INNER JOIN pedidos p ON p.usuario_id = u.id WHERE p.estado = 'pendiente' AND p.fecha_de_creacion > '2026-01-01' ORDER BY p.fecha_de_creacion DESC; -- FIN_SQL
```

## Bloque numerado (los números se ocultan en el PDF)

```ts numbered {2}
const corta = 1;
const lineaResaltadaMuyLarga = "este texto sigue y sigue para que la línea no quepa en el ancho de la página impresa";
const fin = "FIN_NUMERADO";
```

## Tabla ancha

| columna_1 | columna_2 | columna_3 | columna_4 | columna_5 | columna_6 | columna_7 | columna_8 | columna_9 | columna_10 | columna_11 | columna_12 | columna_13 | columna_14 | ULTIMA_COL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| https://ejemplo.com/ruta/larga/1 | https://ejemplo.com/ruta/larga/2 | https://ejemplo.com/ruta/larga/3 | https://ejemplo.com/ruta/larga/4 | https://ejemplo.com/ruta/larga/5 | https://ejemplo.com/ruta/larga/6 | https://ejemplo.com/ruta/larga/7 | https://ejemplo.com/ruta/larga/8 | https://ejemplo.com/ruta/larga/9 | https://ejemplo.com/ruta/larga/10 | https://ejemplo.com/ruta/larga/11 | https://ejemplo.com/ruta/larga/12 | https://ejemplo.com/ruta/larga/13 | https://ejemplo.com/ruta/larga/14 | FIN_TABLA |

## Tabla ancha realista

| ID | Cliente | Correo | Dirección | Producto | Descripción | Estado |
|---|---|---|---|---|---|---|
| 1 | Nombre Apellido Largo | usuario.con.correo.muy.largo@empresa-ejemplo.com | Av. Siempre Viva 742, Col. Centro, Ciudad | Licencia anual premium | Incluye soporte prioritario, actualizaciones y acceso a módulos adicionales | FIN_TABLA_2 |
