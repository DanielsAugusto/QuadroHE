# language: pt
Funcionalidade: Controle de acesso por papel
  Como administradora do QuadroHE
  Quero que operadores não gerenciem contas
  Para reduzir risco de privilégio indevido

  Cenário: Operador não lista usuários
    Dado um usuário com papel operador autenticado
    Quando ele acessa GET /api/usuarios
    Então o sistema responde 403

  Cenário: Operador não se promove a admin
    Dado um usuário com papel operador autenticado
    Quando ele tenta alterar o próprio papel para admin
    Então o sistema responde 403
