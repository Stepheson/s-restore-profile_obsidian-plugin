# S-Restore Profile

Um plugin para o [Obsidian](https://obsidian.md) que permite reinstalar em massa e sincronizar seus plugins e temas da comunidade entre diferentes vaults ou computadores, sem depender de buscas manuais na loja integrada de plugins.

Pense nele como um **restaurador declarativo de pacotes e sincronizador de perfis para o Obsidian** — uma forma portátil e leve de manter um ambiente de trabalho consistente em todos os lugares onde você produz.

---

## Por que usar o S-Restore Profile?

Ao gerenciar múltiplos vaults ou migrar seu ambiente para uma nova máquina, o gerenciador padrão do Obsidian exige que você busque, instale e ative manualmente cada plugin e tema um por um.

Com o **S-Restore Profile**, você pode:
- **Sincronizar Vaults Instantaneamente:** Exporte sua seleção atual de plugins e temas em um único arquivo leve de perfil (`s-resprldata-obsidian.json`) e importe-o em qualquer outro vault para instalar e ativar tudo com apenas um clique.
- **Manter Padrões Estéticos e Produtivos:** Mantenha exatamente os mesmos temas visuais e plugins essenciais alinhados entre seus vaults pessoais, de trabalho e secundários.
- **Recuperação Rápida:** Restaure facilmente suas ferramentas e temas após backups ou migrações de pastas do vault.

---

## Recursos

- **Interface com Abas:** Abas separadas e limpas para gerenciar **Plugins** e **Temas**.
- **Identificação de Tema Ativo:** Identifica qual tema está ativo no momento no seu vault e o define como ativo automaticamente após a reinstalação.
- **Perfis Portáteis:** Exporte os itens selecionados para um arquivo de perfil JSON personalizado (com o nome que você escolher) e importe-o em outro vault.
- **Pulo Inteligente (Smart Skip):** Detecta e pula itens que já estão instalados para economizar banda e tempo.
- **Seleção Rápida:** Botões independentes de "Selecionar todos" e "Desmarcar todos" por aba, com contadores de seleção em tempo real no rodapé.
- **Execução Segura:** O plugin se autoexclui das listas de manipulação para evitar desinstalações ou modificações acidentais de si mesmo.
- **Log em Tempo Real:** Relatórios detalhados mostrando etapas de download, versões encontradas e status de instalação diretamente no modal.
- **Acesso pelo Ribbon:** Ícone personalizado (`s-restore-profile-icon`) adicionado na barra lateral esquerda para acesso rápido.

---

## Como Usar

1. **Abrir o S-Restore Profile:**
   - Clique no ícone de download personalizado (com a letra "S") na barra lateral esquerda (Ribbon), OU
   - Abra a paleta de comandos (`Ctrl/Cmd + P`) e execute `S-Restore Profile: Open S-Restore Profile`.
2. **Selecionar Itens:**
   - Use as abas **Plugins** e **Themes** para marcar ou desmarcar os itens desejados.
   - Use os botões **Select all** ou **Deselect all** para marcar/desmarcar todos os itens na aba ativa.
3. **Exportar/Importar Perfis:**
   - Clique em **Generate Profile Data** para exportar sua seleção atual marcada para um arquivo `.json` personalizado (você pode dar o nome que desejar).
   - Clique em **Load Profile Data** para importar um arquivo de perfil salvo e marcar automaticamente os respectivos itens para instalação.
4. **Reinstalar / Desinstalar:**
   - Clique em **Reinstall selected** para baixar e instalar todos os itens marcados.
   - Clique em **Uninstall selected** para excluir do seu vault os arquivos dos itens marcados (requer confirmação).
5. **Ativar:**
   - Reinicie o Obsidian após o término da instalação para carregar e ativar os novos plugins instalados.

---

## Como Funciona (Fluxo de Download)

O S-Restore Profile evita problemas de CORS e limites de requisição da API do GitHub utilizando a API nativa `requestUrl` do Obsidian por meio de um pipeline de download em três níveis de contingência:

1. **Plano A (Download Direto das Releases):** Resolve o repositório, lê o `manifest.json` na branch principal para identificar a versão atual e baixa os arquivos necessários (`main.js`, `manifest.json`, `styles.css` ou `theme.css`) diretamente da tag de release do GitHub.
2. **Plano B (Fallback da API do GitHub):** Caso o link direto falhe, o plugin faz uma chamada à API de Releases do GitHub para recuperar as URLs de download dos assets da release.
3. **Plano C (Fallback de Arquivos Brutos):** Caso o repositório não possua releases formais criadas (comum em vários temas personalizados), o plugin baixa os arquivos necessários diretamente da branch padrão (ex: `main` ou `master`).

> [!NOTE]
> Alguns temas e plugins não publicam Releases oficiais no GitHub, mantendo os arquivos brutos diretamente no código-fonte da branch principal. O plugin conseguirá instalá-los com sucesso usando o **Plano C**. Caso um item instalado dessa forma não declare o número de versão no seu manifesto, ele será exibido com a mensagem **"No Release version"** ao lado do seu nome.

---

## Requisitos

- Obsidian `1.4.0` ou superior.
- Apenas para desktop (requer acesso a APIs de sistema de arquivos não disponíveis em dispositivos móveis).

---

## Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).
