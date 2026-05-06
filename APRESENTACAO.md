# Bot de Suporte TI via WhatsApp

## O que é

Um assistente de suporte de TI integrado ao WhatsApp que permite aos colaboradores abrirem chamados, consultarem tickets e receberem atendimento humano — tudo sem sair do aplicativo que já usam no dia a dia.

---

## Como funciona na prática

O colaborador manda uma mensagem no WhatsApp e o bot guia todo o processo:

```
Colaborador no WhatsApp
        │
        ▼
   Bot identifica o usuário pelo e-mail corporativo
        │
        ├─► Busca na base de conhecimento do GLPI com IA
        │         └─► Se encontrar solução → responde na hora
        │
        ├─► Se não resolver → abre chamado no GLPI automaticamente
        │
        └─► Transfere para analista humano no Chatwoot
                  └─► Analista responde → mensagem chega no WhatsApp
```

---

## Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| **Identificação automática** | Usuário informa o e-mail corporativo e é reconhecido pelo GLPI |
| **Base de conhecimento com IA** | Antes de abrir chamado, o bot busca artigos e responde com passos práticos |
| **Abertura de chamado** | Chamado criado no GLPI com título, descrição, categoria e solicitante |
| **Consulta de chamados** | Usuário pode ver seus chamados abertos e o status de cada um |
| **Onboarding** | Fluxo dedicado para novos colaboradores (primeiro acesso, configurações iniciais) |
| **Atendimento humano** | Transferência para analista via Chatwoot com troca de mensagens bidirecional |
| **Avaliação de satisfação (CSAT)** | Após encerramento, usuário avalia o atendimento de 1 a 10 direto pelo WhatsApp |
| **Usuário anônimo** | Visitantes ou prestadores sem cadastro também conseguem abrir chamados |

---

## Benefícios

- **Zero fricção para o usuário** — canal já conhecido, sem instalar nada
- **Redução de chamados simples** — IA resolve dúvidas frequentes antes de escalar
- **Analista mais produtivo** — só recebe o que a IA não conseguiu resolver
- **Rastreabilidade total** — tudo registrado no GLPI com categoria, solicitante e histórico
- **Satisfação medida** — pesquisa CSAT automática após cada atendimento

---

## Tecnologias utilizadas

| Componente | Função |
|---|---|
| **GLPI** | Sistema de chamados — fonte de dados de usuários, tickets e base de conhecimento |
| **Evolution API** | Gateway de conexão com o WhatsApp |
| **Chatwoot** | Plataforma de atendimento humano |
| **Claude (Anthropic)** | Inteligência artificial para busca na KB e extração de informações |
| **Redis** | Gerenciamento de sessões dos usuários |
| **Docker** | Toda a solução roda em containers, fácil de instalar e manter |

---

## Exemplo de conversa

> 👤 **Colaborador:** Olá  
> 🤖 **Bot:** Olá! Informe seu e-mail corporativo para começarmos.  
>
> 👤 lucas@empresa.com.br  
> 🤖 Olá, Lucas! Como posso te ajudar?  
> *(Menu: 1 - Abrir Chamado / 2 - Consultar Chamados / 3 - Onboarding / 0 - Sair)*  
>
> 👤 **1**  
> 🤖 Qual o título do seu problema?  
>
> 👤 Não consigo acessar a pasta de rede no MacBook  
> 🤖 Encontrei um artigo que pode resolver!  
> 📌 *Acesso à pasta de rede no MacBook*  
> 1. Pressione Command+K no Finder...  
> 🔗 Artigo completo: https://glpi.empresa.com.br/...  
> *(Isso resolveu? 1 - Sim / 2 - Não, preciso de chamado)*  
>
> 👤 **2**  
> 🤖 Chamado #177 aberto! Um analista entrará em contato em breve.  
>
> *(Analista responde no Chatwoot → mensagem chega no WhatsApp)*  
>
> *(Analista resolve e fecha → bot envia pesquisa)*  
> 🤖 De 1 a 10, como você avalia o atendimento?  
> 👤 **9**  
> 🤖 😄 Obrigado pela avaliação! Nota 9/10. Até a próxima!

---

## Infraestrutura

Toda a solução roda em Docker na própria infraestrutura da empresa — sem enviar dados para serviços externos além da API do Claude (Anthropic) para processamento de linguagem natural.

A instalação completa é feita com um único comando.
