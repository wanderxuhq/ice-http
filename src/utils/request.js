function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        req.on('error', (err) => {
            reject(err);
        });

        req.on('data', (chunk) => {
            chunks.push(chunk);
        });

        req.on('end', () => {
            const rawBodyBuffer = Buffer.concat(chunks);

            const rawBodyString = rawBodyBuffer.toString('utf8');

            resolve(rawBodyString);
        });
    });
}

export {
    getRawBody
}