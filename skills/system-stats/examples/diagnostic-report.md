# Example diagnostic reports

All measurements below are fictional teaching fixtures. They are not readings from the creator's machine or the user's computer. The assistant must use current tool results and reply in the user's language.

## Sustained RAM pressure with missing temperature

Request: "Mi PC esta lenta; revisa que puede estar pasando."

Illustrative evidence: three RAM samples of 92%, 93%, 92%; CPU 18%, 25%, 20%; CPU temperature `N/A`; a browser uses about 5.8 GiB in the process ranking. The sampling interval is 1000 ms and returned elapsed time is 2.6 seconds.

**Hallazgo:** La RAM estuvo por encima del 90% durante la ventana medida. Es una posible contribucion a la lentitud; estas lecturas no demuestran por si solas la causa completa.

**Evidencia:** RAM media 92.3%, pico 93%; CPU media 21%, pico 25%, en tres muestras durante 2.6 segundos. El navegador fue el mayor consumidor observado, con aproximadamente 5.8 GiB.

**Limites:** No hay lectura de temperatura. El ranking de procesos no prueba por si solo una fuga de memoria. No se midio latencia de disco ni se observo el equipo durante un periodo prolongado.

**Siguientes pasos:** Guardar el trabajo, revisar las pestanas o tareas del navegador y repetir la medicion mientras ocurre la lentitud. Cerrar aplicaciones seria una accion posterior elegida por el usuario.

## Isolated spike, idle network, disk nearly full

Illustrative evidence: CPU 12%, 96%, 15%; RAM 40%, 41%, 40%; volume capacity 88% used; measured network traffic 0 Mbps; disk I/O latency unavailable.

**Finding:** There was a CPU spike in the short sampling window, with no sustained CPU pressure demonstrated. Storage capacity is worth reviewing separately.

**Evidence:** CPU peaked at 96% but averaged 41% across three samples; the volume was 88% full. Network traffic was measured as zero during the sample.

**Limits:** A quiet network does not show an outage. Volume capacity does not establish a disk performance bottleneck, and these samples cannot identify the cause of an intermittent slowdown.

**Next steps:** Repeat while the symptom is present and capture a CPU process ranking then. Review storage usage if space is needed; do not delete files automatically.

## MCP unavailable

**Finding:** I cannot measure this computer because the local system-stats MCP tools are not connected in this session.

**Next step:** Offer the setup reference if connection help is requested. Do not substitute the numbers from these examples or another machine. Loading the skill through Agensi alone does not grant hardware access.
