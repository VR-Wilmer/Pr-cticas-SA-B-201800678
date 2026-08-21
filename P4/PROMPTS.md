# PROMPTS.md

Registro de los prompts reales usados para generar este proyecto, un resumen de la respuesta
obtenida y los ajustes aplicados tras la revision.

---

## Prompt 1 — 2026-08-20

**Prompt (texto real):**

> Ahora vamos a hacer la practica 4, vamos a usar la misma logica que siempre usamos, si hay dudas
> debes preguntarme, si hay cosas que esten ambiguas o no documentadas dimelo

**Interpretacion:** el usuario pidio replicar el mismo proceso seguido en P1/P2/P3 (leer el
enunciado, `P4/0780_Practica_4_2S2026.pdf`, resolver ambiguedades con preguntas antes de
codificar) para una practica que, a diferencia de P3 (solo diseno), exige **implementacion
funcional** de una arquitectura de microservicios de tematica libre.

**Ambiguedades identificadas y senaladas al usuario antes de codificar** (el enunciado las deja
explicitamente libres, o no las especifica del todo):

1. Tematica del sistema — el enunciado dice literalmente "tematica libre".
2. Segundo lenguaje de programacion (minimo 2 distintos) — el enunciado da una lista de opciones
   sin preferencia.
3. Formato del contrato de microservicios (Swagger o Postman) — el enunciado permite cualquiera de
   los dos, y no dice como documentar el contrato de los servicios GraphQL (que no son REST).

**Preguntas de aclaracion hechas (via `AskUserQuestion`) y respuestas del usuario:**

1. Tematica: continuar el diseno bancario de P3 (reducido) vs. un sistema nuevo mas simple ->
   **sistema nuevo, mas simple**; al elegir un ejemplo concreto entre mesa de ayuda/tickets vs.
   inventario/pedidos -> **mesa de ayuda / tickets de soporte**.
2. Segundo lenguaje: Python, Go o Java -> **Python (FastAPI)**.
3. Como distribuir Node (ya dominado en P1/P2) y Python (nuevo) entre los 4 microservicios ->
   **Identidad + servicio de negocio principal (Tickets) en Node, 1 microservicio secundario
   (Asignacion de Agentes) en Python**, para acotar el riesgo del lenguaje nuevo al servicio menos
   critico.
4. Formato de contrato: Swagger/OpenAPI por servicio vs. coleccion Postman ->
   **Swagger/OpenAPI** para los servicios REST (mas SDL de GraphQL para los servicios GraphQL,
   decision tomada durante la planificacion al no existir un equivalente Swagger nativo para
   GraphQL).

**Decisiones de diseno no preguntadas explicitamente** (detalles de implementacion derivados de
las respuestas anteriores, documentados con su justificacion en `README.md` y
`MANUAL_TECNICO.md`):

- Fusionar en `identidad-service` el registro/login (que en P2 vivia en `backend/`) con el
  `/authorize` verify-only (que en P2 era el `auth-service` separado): P4 pide 4 microservicios de
  negocio, no una separacion identidad/autorizacion en dos piezas como P2.
- Extender el contrato de `/authorize` para devolver tambien los datos del usuario autenticado
  (`{ allowed, usuario }`), no solo el booleano de P2 — necesario porque en P4 los microservicios
  que consultan a Identidad nunca decodifican el JWT ellos mismos.
- Usar bcrypt para la contrasena en vez del cifrado AES reversible de P2 (P4 no exige
  reversibilidad).
- No usar Kafka/broker de mensajeria (P4 no lo exige, a diferencia del diseno de P3): los efectos
  posteriores a crear un ticket se resuelven con llamadas REST/GraphQL directas y sincronas,
  aceptando consistencia eventual "manual" (log del error, sin bloquear ni revertir al cliente).
- Proteger las rutas internas servicio-a-servicio (`POST /asignaciones`,
  `registrarNotificacion`) con un secreto compartido simple (`X-Internal-Secret`) en vez de
  reimplementar la verificacion de JWT/roles de Identidad en Python.
- Modelo de dominio de la mesa de ayuda (categorias `SOFTWARE`/`HARDWARE`/`RED`/`CUENTA`, estados
  de ticket, roles `ADMIN`/`AGENTE`/`CLIENTE`, algoritmo de asignacion por menor carga): no
  especificado por el enunciado (que no define dominio de negocio, solo requisitos tecnicos),
  disenado libremente para esta iteracion.

El plan completo (arquitectura, estructura de archivos, orden de implementacion) se presento al
usuario en modo plan y fue aprobado antes de escribir codigo.
