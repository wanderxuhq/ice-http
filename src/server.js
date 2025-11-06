import http from "http";

function createServer(requestListener) {
    return http.createServer(requestListener);
}

function startServer(server, port, hostname) {
    return new Promise((resolve) => {
        server.listen(port, hostname, () => {
            console.log(`Server running at http://${hostname}:${port}/`);
            resolve(server);
        });
    });
}

export { createServer, startServer };
