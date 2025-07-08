var Service = require('node-windows').Service;

// Crie um novo objeto de Serviço
// O nome 'nortis-server' e a descrição devem ser EXATAMENTE os mesmos que você usou para instalar.
var svc = new Service({
  name: 'NortisAppServer', // << MUITO IMPORTANTE: Coloque o nome exato do seu serviço aqui
  description: 'Servidor Node.js para a aplicação financeira Nortis.',
  script: require('path').join(__dirname, 'server.js')
});

// Escute o evento 'uninstall'
svc.on('uninstall', function(){
  console.log('Serviço desinstalado com sucesso.');
  console.log('O serviço existe agora: ', svc.exists);
});

// Desinstale o serviço.
svc.uninstall();