# PROMPTS.md

Registro de los prompts reales usados para generar o refactorizar el contenido de este proyecto,
un resumen de la respuesta obtenida y los ajustes aplicados tras la revisión.

---

## Prompt 1 — 2026-08-06

**Prompt (texto real):**

> Ahora necesito que construyamos laa practica 3 en la carpeta correspondiente

**Interpretación:** el usuario pidió analizar el enunciado de la Práctica 3
(`Practica_3_2S2026.pdf`, "Diseño Arquitectura") y construir el diseño completo dentro de `P3/`.
A diferencia de P1 y P2, esta práctica no requiere código: es una práctica de diseño, con
diagramas y documentación como entregables.

**Observación hecha antes de generar contenido:** la sección 4 ("Entregables") del PDF menciona
"carpeta P1" y explicación de los 5 principios SOLID — texto copiado del template de P1/P2 que no
aplica a una práctica sin código. Se siguió en su lugar la rúbrica detallada de la sección 8,
específica de esta práctica (arquitectura, diagramas ER/UML por microservicio, flujo de
aprobación, carpeta `P3`).

**Preguntas de aclaración hechas antes de generar contenido:**

1. Formato de los diagramas → el usuario pidió **ambos**: Mermaid embebido en Markdown (que se
   renderiza directamente) y archivos `.drawio` reales, aclarando que él mismo verificaría estos
   últimos abriéndolos en Draw.io.
2. Tecnología de mensajería asíncrona → **Apache Kafka**, por el ajuste natural con
   auditoría/trazabilidad bancaria (recomendado y elegido).
3. Almacenamiento de los CSV → **AWS S3** (recomendado y elegido).
4. Descomposición en microservicios → se propusieron 5 servicios de negocio (Identidad y
   Permisos, Lotes de Transacciones, Validación y Prevención de Fraude, Integración Core
   Bancario, Notificaciones) + API Gateway + plataforma de logging, cada uno mapeado 1 a 1 con una
   responsabilidad explícita del enunciado. El usuario confirmó proceder con esa descomposición.

**Respuesta (resumen de lo generado):**

- `README.md`: arquitectura general (diagrama Mermaid), diagrama de componentes, tabla de
  microservicios con enlaces, integración con la Práctica 2 (reutilización explícita del
  `auth-service` de P2, extendido con roles maker/checker/authorizer), tabla de reglas de negocio
  reflejadas, estrategia de almacenamiento CSV (S3), estrategia de logging centralizado (ELK),
  justificación de comunicación entre servicios (REST + Kafka), propuesta de API Gateway (Kong),
  tabla de tecnologías/patrones con justificación, y una sección de decisiones de diseño y
  trade-offs (consistencia eventual, idempotencia de consumidores, Docker/Kubernetes opcional).
- `docs/microservicios/01..05-*.md`: responsabilidad, endpoints, diagrama ER y diagrama de clases
  UML (Mermaid) de cada uno de los 5 microservicios.
- `docs/flujo-aprobacion.md`: definición del flujo maker-checker-authorizer, regla de segregación
  de funciones (3 usuarios distintos), diagrama de estados del lote, y los 3 diagramas de
  secuencia UML de los flujos críticos (aprobación de 3 pasos, envío al core bancario,
  notificación a clientes) en Mermaid.
- `docs/diagramas/drawio/`: los mismos 15 diagramas (arquitectura, componentes, 5 ER, 5 clases, 3
  secuencia) como archivos `.drawio` reales, organizados en 4 archivos multi-página. Validados
  como XML bien formado antes de la entrega (`xml.etree.ElementTree`), pendientes de revisión
  visual por el usuario en Draw.io.

**Ajustes aplicados por el estudiante tras la revisión:**

_(pendiente — se completa después de revisar esta iteración)_
