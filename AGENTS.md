# Instrucoes Para Agentes

## Fluxo Obrigatorio De Branch

- Nunca editar arquivos diretamente na branch `main`.
- Antes de qualquer alteracao de codigo, configuracao ou documentacao, verificar a branch atual com `git branch --show-current`.
- Se a branch atual for `main`, criar e trocar para uma nova branch antes de editar qualquer arquivo.
- Usar nomes de branch claros, preferencialmente com prefixos como:
  - `feature/nome-da-alteracao`
  - `fix/nome-do-ajuste`
  - `docs/nome-da-documentacao`
- Confirmar que a troca de branch foi concluida antes da primeira edicao.
- Nao fazer commit, push ou pull request sem pedido explicito do usuario.

## Regra De Seguranca

Se nao for possivel criar ou trocar de branch, parar o trabalho e avisar o usuario antes de alterar qualquer arquivo.
