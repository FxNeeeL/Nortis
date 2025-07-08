const Service = require('node-windows').Service;
const path = require('path');

// Crie um novo objeto de Serviço
const svc = new Service({
    name: 'NortisAppServer', // Nome do serviço (visível no Gerenciador de Serviços do Windows)
    description: 'Servidor Node.js para a aplicação financeira Nortis.',
    script: path.join(__dirname, 'server.js'), // Caminho para o seu arquivo server.js
    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096'
    ]
});

// Escute o evento 'install', que indica que o
// script foi instalado como um serviço.
svc.on('install', function(){
    console.log('Serviço Nortis instalado com sucesso.');
    console.log('Para iniciar o serviço, execute: net start NortisAppServer');
    svc.start();
});

// Escute o evento 'uninstall'
svc.on('uninstall', function(){
    console.log('Serviço Nortis desinstalado.');
    console.log('O serviço não existe mais.');
});

// Instala o serviço
svc.install();