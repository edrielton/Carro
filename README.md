# Carro 3D — Neon Rush

Um jogo de corrida arcade em 3D, desenvolvido em JavaScript puro com HTML, CSS e Three.js. O projeto simula uma corrida infinita em faixa única, com sistema de pontuação, clima dinâmico, loja de upgrades e personalização visual.

## Visão geral

O jogador controla um carro em três faixas, desvia de veículos em movimento, acumula pontos e desbloqueia melhorias para aumentar velocidade, estabilidade e desempenho geral. A experiência inclui:

- Corrida infinita em 3D
- Modo de pausa e reinício
- Sistema de pontuação e combo
- Variação climática (claro, dusk, chuva, noite)
- Loja com upgrades de motor, suspensão e turbo
- Personalização de skins do veículo
- Suporte a desktop e mobile

## Capturas de tela

O projeto é visualmente inspirado em HUDs neon, cenários urbanos e efeitos de velocidade com estética futurista.

## Tecnologias

- HTML5
- CSS3
- JavaScript
- Three.js via CDN

## Estrutura do projeto

```text
Carro/
├── index.html
├── style.css
├── script.js
├── README.md
└── assets/ (se houver em futuras versões)
```

## Como executar

Como o projeto é estático, você pode abrir o arquivo `index.html` diretamente no navegador ou rodar um servidor local.

### Opção 1: abrir diretamente

1. Abra `index.html` em um navegador.
2. Aguarde o carregamento do Three.js via CDN.

### Opção 2: servidor local

No terminal, na raiz do projeto:

```bash
python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

## Controles

### Desktop

- `A` / `←` para mover para a esquerda
- `D` / `→` para mover para a direita
- `P` para pausar
- `U` para abrir a loja
- `Esc` para pausar

### Mobile

- Toque nas setas exibidas na tela para trocar de faixa

## Sistema de jogo

- O carro acelera progressivamente ao longo do tempo
- A velocidade aumenta conforme a fase avança
- O combo aumenta ao desviar corretamente do trânsito
- Créditos são ganhos com pontos e progresso
- Os upgrades melhoram desempenho dos atributos do veículo
- Cada skin pode ser comprada e selecionada na loja

## Loja e progressão

A loja oferece:

- Motor: aumento de velocidade máxima e aceleração
- Suspensão: melhora no controle ao trocar de faixa
- Turbo: ganho extra de potência em rajadas
- Skins: skins exclusivas com custo em créditos

## Observações

- O jogo utiliza `localStorage` para salvar créditos, upgrades e skins adquiridas.
- O cenário e a lógica ficam em `script.js`, enquanto o visual fica em `style.css`.
- A reprodução depende de uma conexão com a internet para carregar o Three.js na CDN.

## Contribuição

Contribuições são bem-vindas. Se quiser melhorar o jogo, sugerir mais mecânicas ou ajustar o visual, pode abrir uma issue ou enviar um pull request.

## Licença

Este projeto está disponível para fins educacionais e de demonstração.

---

Desenvolvido como um projeto de arcade 3D leve, com foco em jogabilidade direta e visual neon.
