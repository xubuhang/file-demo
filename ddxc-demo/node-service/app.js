const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const SparkMD5 = require('spark-md5');

const cors = require('cors');
const app = express();
const port = 3000;

// 配置multer
const upload = multer({ dest: 'uploads/chunks/' });
app.use(cors()); // 允许所有来源的跨域请求
// 中间件，解析JSON请求
app.use(express.json());


// 检查已有分片接口
app.get('/existing-chunks', (req, res) => {
    const { fileName } = req.query;
    const chunkDir = path.join('uploads/chunks/', fileName);
    if (!fs.existsSync(chunkDir)) {
        return res.json({ existingChunks: [] });
    }
    const chunkFiles = fs.readdirSync(chunkDir);
    const existingChunks = chunkFiles.map(file => {
        const [index, hash] = file.split('_');
        return { index: parseInt(index), hash };
    });
    res.json({ existingChunks });
});

// 上传分片接口
app.post('/upload', upload.single('chunk'), (req, res) => {
    const { index, fileName, chunkHash } = req.body;
    const chunkPath = req.file.path;
    const chunkDir = path.join('uploads/chunks/', fileName);
    const chunkFilePath = path.join(chunkDir, `${index}_${chunkHash}`);

    console.log(`Received chunk ${index} with hash ${chunkHash}`);
    // 检查分片文件是否已存在
    if (fs.existsSync(chunkFilePath)) {
        // 分片文件已存在，直接返回成功响应
        return res.status(200).json({ message: 'Chunk already exists' });
    }
    // // 读取上传的文件分片
    // const chunkData = fs.readFileSync(chunkPath);
    // const calculatedHash = calculateFileHash(chunkData);
    // console.log(`Calculated hash for chunk ${index}: ${calculatedHash}`);
    // if (calculatedHash !== chunkHash) {
    //     // 哈希值不匹配，说明文件分片可能被篡改
    //     fs.unlinkSync(chunkPath); // 删除分片
    //     return res.status(400).json({ error: 'Invalid chunk hash' });
    // }

    if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir, { recursive: true });
    }

    fs.renameSync(chunkPath, chunkFilePath);

    res.status(200).json({ message: 'Chunk uploaded successfully' });
});

// 合并文件接口
app.post('/merge', (req, res) => {
    const { fileName, combinedHash } = req.body;
    const chunkDir = path.join('uploads/chunks/', fileName);
    const mergedFilePath = path.join('uploads/merged/', fileName);
    
    if (!fs.existsSync(chunkDir)) {
        return res.status(400).json({ error: 'No chunks found' });
    }

    const mergedDir = path.dirname(mergedFilePath);
    if (!fs.existsSync(mergedDir)) {
        fs.mkdirSync(mergedDir, { recursive: true });
    }

    const chunkFiles = fs.readdirSync(chunkDir);
    chunkFiles.sort((a, b) =>  {
        const indexA = parseInt(a.split('_')[0]);
        const indexB = parseInt(b.split('_')[0]);
        return indexA - indexB;
    }); // 按顺序排序

    const writeStream = fs.createWriteStream(mergedFilePath);

    chunkFiles.forEach(chunkFile => {
        const chunkPath = path.join(chunkDir, chunkFile);
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
        fs.unlinkSync(chunkPath); // 删除分片
    });

    writeStream.end();
    fs.rmdirSync(chunkDir);
    writeStream.on('finish', () => {
        // 使用 SparkMD5 计算合并文件的 MD5 哈希
        calculateFileMD5(mergedFilePath)
            .then(calculatedCombinedHash => {
                if (calculatedCombinedHash !== combinedHash) {
                    fs.unlinkSync(mergedFilePath); // 删除合并的文件
                    return res.status(400).json({ error: 'Invalid combined hash' });
                }
                console.error('合并文件成功:'+calculatedCombinedHash);
                res.status(200).json({ message: 'File merged successfully', hash: calculatedCombinedHash });
            })
            .catch(err => {
                console.error('合并文件时出错：', err);
                res.status(500).json({ error: 'Internal server error' });
            });
    });

    writeStream.on('error', (err) => {
        console.error('合并文件时出错：', err);
        res.status(500).json({ error: 'Internal server error' });
    });
});

// 计算文件的 MD5 哈希值
function calculateFileMD5(filePath) {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(filePath);
        const spark = new SparkMD5.ArrayBuffer();
        readStream.on('data', chunk => {
            spark.append(chunk);
        });

        readStream.on('end', () => {
            const hash = spark.end();
            resolve(hash);
        });

        readStream.on('error', err => {
            reject(err);
        });
    });
}
// 计算单个文件块的哈希值
function calculateFileHash(chunkData) {
    const hash = SparkMD5.ArrayBuffer.hash(chunkData);
    return hash;
}


// 计算合并文件的哈希值
function calculateCombinedHash(chunkHashes) {
    // 所有Worker完成任务后合并结果
    const spark = new SparkMD5.ArrayBuffer();
    for (let hash of chunkHashes) {
        spark.append(hash);
    }
    const combinedHash = spark.end();
    return combinedHash;
}

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
