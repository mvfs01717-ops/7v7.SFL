# Decisões do núcleo de gameplay (registro)

Data: 2026-11-25. Tomadas por delegação do usuário ("o que você achar melhor"). Podem ser revistas.

## 1. Gols e resultado
- **Decisão**: o plano continua decidindo gols e resultado, como hoje. A física só executa o lance.
- Se a execução visual contradiz o plano, o resultado segue o plano e a execução é ajustada.
- Mudar isso (deixar a simulação decidir o gol) exige confirmação explícita, porque contraria a regra vigente.

## 2. Multiplayer
- **Decisão**: o anfitrião é a autoridade. Cada lance usa sorteio determinístico por chave (`src/lib/game/seeded.ts`), derivado de sala, minuto, item do plano e ação.
- Os lances críticos (passe, disputa, chute, defesa) são resolvidos pelo anfitrião e enviados ao convidado. O convidado não sorteia nenhum lance crítico.
- Sorteios por quadro ou por `dt` (MatchPitch, linhas 2515, 2520, 2707, 2834) passam a ser sorteados uma vez por ação.
- Visual pode continuar com `Math.random`.

## 3. Fallback
- O motor atual (plano com `animOn`) permanece como fallback até a nova física passar nos testes com duas contas.

## Estado
- Pronto e testado: gerador determinístico (8 testes em `tests/game/seeded.test.ts`).
- Ainda não ligado ao `MatchPitch`. A ligação exige ajustar as chaves de cada lance e testar com duas contas e em celular real, o que ainda não foi feito.
- Auditoria completa das 63 ocorrências: `docs/auditoria-math-random.md`.
