# Auditoria de Math.random() no MatchPitch

Arquivo: `src/components/MatchPitch.tsx` (commit de referência: `fd42586`, branch `main`).

## Números

- **63** ocorrências literais de `Math.random` (linhas 199 e 200 são os helpers `rand` e `pick`; a 552 é só comentário). Sobram **60 chamadas reais**.
- Além disso, **88 chamadas de `rand()`** e **8 de `pick()`**, que consomem o mesmo gerador. São as que mais aparecem nas posições de corrida e nos alvos de carregamento.
- **7** vezes o `Math.random` é passado como argumento para outras funções (`chooseDribble`, `chooseCorner`, `pickWinner`, `chooseTackle`, `counterRead` etc.).
- **2** sorteios usam `dt` (tempo do quadro) como taxa por segundo: linhas 2515 e 2520. Na média não dependem da taxa de quadros, mas cada cliente sorteia por conta própria.
- **17** chamadas de `wrand` são determinísticas (função seno, por índice). Só servem para marcas visuais de desgaste e poças.

## Classes

- **Visual**: não altera resultado nem posição relevante. Pode continuar com `Math.random`.
- **Gameplay**: decide quem age, para onde vai, se a ação dá certo.
- **Física**: decide trajetória ou velocidade da bola.
- **Ordem de eventos**: decide a sequência de ações ou a ordem de processamento.
- **Multiplayer**: o lance é recalculado em cada cliente, então pode divergir. Todo sorteio de gameplay/física/ordem entra aqui.

## Ocorrências (63 linhas)

| Linha | O que decide | Classe | Risco multiplayer |
|---|---|---|---|
| 199 | helper `rand(min,max)` (gerador base) | infraestrutura | sim, por herança |
| 200 | helper `pick(list)` | infraestrutura | sim, por herança |
| 436 | filtro: goleiro entra na lista de receptores | Gameplay | sim |
| 442 | ruído no score de receptor do passe | Gameplay | **crítico** |
| 552 | comentário sobre sorteio determinístico da cobrança | — | — |
| 884 | corrida de apoio: se o atacante vai ao espaço | Gameplay | sim |
| 950 | `chooseDribble` recebe `Math.random` | Gameplay | sim |
| 955 | vitória do drible | Gameplay | **crítico** |
| 1046 | narração: nota de estilo (12%) | Visual | não |
| 1070 | narração: nota de papel (15%) | Visual | não |
| 1090 | ruído de leitura do passe (3 sorteios) | Gameplay | sim |
| 1105 | ruído do termo de IA no passe (3 sorteios) | Gameplay | sim |
| 1208 | função de contato na recepção, recebe `Math.random` (função exata não verificada) | Gameplay | sim |
| 1240 | velocidade da bola solta após erro de domínio | Física | sim |
| 1312 | chance de o passe ser ajustado para o corredor | Gameplay | sim |
| 1314 | sentido e tamanho do ajuste do passe | Gameplay/Física | sim |
| 1375 | bola chega ao receptor (acerto do passe) | Gameplay | **crítico** |
| 1541 | `pick` do ator da jogada | Gameplay | sim |
| 1558 | `sort` aleatório da ordem dos pontas | Ordem de eventos | sim |
| 1620 | `pick` de quem inicia (contra-ataque) | Gameplay | sim |
| 1622 | lançamento: 30% começam no goleiro | Gameplay | sim |
| 1624 | `pick` de quem inicia (ramo padrão) | Gameplay | sim |
| 1678 | `canDribble` e distância do carregamento | Gameplay | sim |
| 1683 | chance de passe para o terceiro | Gameplay | sim |
| 1694 | drible durante o carregamento | Gameplay | sim |
| 1706 | drible durante o carregamento | Gameplay | sim |
| 1736 | drible durante o carregamento | Gameplay | sim |
| 1743 | drible durante o carregamento | Gameplay | sim |
| 1748 | drible durante o carregamento | Gameplay | sim |
| 1751 | drible no carregamento (ramo de defesa, 50%) | Gameplay | sim |
| 1752 | carregamento extra (40%) | Gameplay | sim |
| 1778 | tipo de escanteio (`chooseCorner`) | Gameplay | sim |
| 1988 | estilo de finalização: canto ou meio | Gameplay | sim |
| 1993 | lado do canto | Gameplay | sim |
| 2068 | efeito (arco) da bola | Física | sim |
| 2077 | ângulo do rebote do goleiro | Física | sim |
| 2096 | lado do chute | Gameplay/Física | sim |
| 2382 | `pickWinner`: vence a bola solta | Gameplay | **crítico** |
| 2515 | proteção da posse: taxa por segundo (vezes `dt`) | Gameplay | **crítico**: sorteio próprio de cada cliente |
| 2520 | bote do defensor: taxa por segundo (vezes `dt`) | Gameplay | **crítico**: sorteio próprio de cada cliente |
| 2528 | `chooseTackle` recebe `Math.random` | Gameplay | sim |
| 2544 | vencedor da disputa | Gameplay | **crítico** |
| 2582 | a disputa solta a bola (40%) | Física/Ordem | sim |
| 2584 | ângulo e velocidade da bola solta na disputa | Física | sim |
| 2695 | `counterRead` (leitura do contra-ataque) | Ordem de eventos | sim |
| 2707 | lateral decidido a cada ciclo de decisão (6%) | Ordem de eventos | sim |
| 2727 | recomeço/reciclagem da bola (60%) | Gameplay | sim |
| 2728 | recuo da bola (30%) | Gameplay | sim |
| 2834 | decisão de chutar a cada ciclo de decisão | Gameplay | sim |
| 2843 | bola colocada (35%) | Gameplay | sim |
| 2859 | bloqueio do defensor | Gameplay | sim |
| 2870 | desvio do bloqueio (`deflect`) | Física | sim |
| 2879 | defesa do goleiro | Gameplay | **crítico** |
| 2888 | chance de rebote na defesa | Gameplay | sim |
| 2889 | ângulo do rebote | Física | sim |
| 2896 | lado da bola que sai pela linha de fundo | Gameplay | sim |
| 2957 | drible ou passe (60%, quando não há decisão) | Gameplay | sim |
| 2963 | conduzir ou não (55%, quando não há decisão) | Gameplay | sim |
| 2980 | cruzamento pelas pontas (55%) | Gameplay | sim |
| 3018 | quantos receptores de cortina (2 ou 1) | Gameplay | sim |
| 3021 | escolha do receptor da cortina | Gameplay | sim |
| 3462 | poeira do drible (partícula) | Visual | não |
| 3513 | posição das partículas de poeira | Visual | não |
| 3514 | posição das partículas de poeira | Visual | não |
| 3515 | velocidade das partículas de poeira | Visual | não |
| 3516 | velocidade das partículas de poeira | Visual | não |

Resumo: 8 visuais, 52 com efeito no lance, 10 críticos (decidem disputa, chute, passe ou defesa).

## O que isso significa no multiplayer

1. **O plano é compartilhado; o lance não.** O anfitrião gera o plano (`App.tsx`, `myRole === 'host'`, linha ~864) e grava em `rooms.plan`. Os gols e defesas são escolhidos no plano (`helpers.ts`, linhas 94–97). Mas a execução visível (passe, drible, disputa, chute, defesa) é sorteada em cada cliente. Um cliente pode mostrar o passe certo e o outro, errado, e o plano pode dizer gol num lado e defesa visual no outro.
2. **Correção sobre a versão anterior desta auditoria.** As decisões de 2707 e 2834 não rodam a cada quadro. Rodam uma vez por ciclo de decisão, porque o bloco só executa quando `now >= st.ambientAt`, e essa data é reajustada entre 120 e 420 ms (linha 3008). Os sorteios de 2515 e 2520 usam `dt` como taxa, então, na média, não dependem do quadro. O problema real é outro: cada cliente sorteia por conta própria.
3. **Não há semente.** Nenhum dos 60 sorteios de gameplay usa semente compartilhada. Só a bola parada tem sorteio determinístico (`restartRoll`, FNV sobre a chave do lance, em `lib/game/restart.ts`) e ele foi testado só localmente.

## Tratamento proposto (ainda não implementado)

- **Visual (8)**: manter `Math.random`. Nenhuma mudança de comportamento.
- **Gameplay/física/ordem (52)**: trocar por um gerador semeado por lance. A semente é `hash(roomId, minuto, índice do item do plano, índice do passo, chave da ação)`. Com a mesma semente, qualquer cliente tira o mesmo número.
- **Sorteios de decisão (2707, 2834, 2957, 2963, 2980)**: passam a usar semente pela chave do ciclo de decisão, para que o convidado calcule a mesma escolha.
- **Sorteios por `dt` (2515, 2520)**: passam a usar semente pela chave da ação de posse, com o mesmo cálculo de taxa.
- **Lances críticos (10)**: o anfitrião calcula o resultado e envia pelo canal do Supabase. O convidado usa esse resultado e não sorteia. Esse é o modelo que o plano já segue para gol e defesa, estendido para o lance.
- **Continuam fora do alcance desta etapa**: o comportamento do convidado durante a cobrança (esperar, mover os jogadores, receber o estado) e a sincronização da escolha da cobrança. Ambos precisam da decisão sobre o modelo de multiplayer.

## Pontos a confirmar com você

1. Confirma o modelo recomendado: semente por lance, com o anfitrião enviando os resultados dos lances críticos?
2. O resultado do lance pode mudar um gol que o plano já definiu? (Isso é a decisão sobre gols, que segue pendente.)
