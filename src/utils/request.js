const getRawBody = (req, maxLength) => {
    const stackLines = new Error('Request body too large').stack.split('\n');
    const capturedStack = stackLines.slice(3).join('\n'); // 2. 去掉前3行

    return new Promise((resolve, reject) => {
        const chunks = [];
        let receivedLength = 0;

        req.on('error', (err) => {
            reject(err);
        });

        req.on('data', (chunk) => {
            if (typeof maxLength === 'number') {
                receivedLength += chunk.length;
                if (receivedLength > maxLength) {
                    const err = new Error('Request body too large');
                    err.stack = `${err.name}: ${err.message}\n${capturedStack}`;
                    reject(err);
                    return;
                }
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            const rawBodyBuffer = Buffer.concat(chunks);
            resolve(rawBodyBuffer);
        });
    });
}

export {
    getRawBody
}
