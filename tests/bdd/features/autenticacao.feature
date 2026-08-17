# language: pt
Funcionalidade: Autenticação na secretaria
  Como servidor da secretaria de educação
  Quero entrar no QuadroHE com e-mail e senha
  Para acessar cadastros de professores, escolas e hora extra

  Cenário: Login bem-sucedido
    Dado que existe um administrador cadastrado
    Quando ele informa e-mail e senha corretos
    Então o sistema devolve um token e os dados do usuário sem a senha

  Cenário: Senha incorreta
    Dado que existe um administrador cadastrado
    Quando ele informa a senha errada
    Então o acesso é recusado com "Credenciais inválidas"

  Cenário: Área restrita sem login
    Dado um visitante sem sessão
    Quando ele tenta listar professores
    Então o sistema responde 401

  Cenário: Logout encerra a sessão no servidor
    Dado um administrador autenticado
    Quando ele sai do sistema
    Então o token anterior deixa de valer
