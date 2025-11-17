function getRawBody(req, maxLength = 1024 * 1024) { // Default to 1MB
    return new Promise((resolve, reject) => {
        const chunks = [];
        let receivedLength = 0;

        req.on('error', (err) => {
            reject(err);
        });

        req.on('data', (chunk) => {
            receivedLength += chunk.length;

            if (receivedLength > maxLength) {
                req.destroy();
                reject(new Error('Request body too large'));
                return;
            }
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
