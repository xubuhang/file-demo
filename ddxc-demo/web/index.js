async function showPath() {
    var fileInput = document.getElementById('file');
    var path = document.getElementById('path');

    if (fileInput.files.length === 0) {
        path.innerHTML = "没有选择文件";
        return;
    }

    path.innerHTML = "生成MD5值中，请稍等...";

    const file = fileInput.files[0];

     // 获取CPU核心数
     const numCores = navigator.hardwareConcurrency || 4;
     const chunkSize = Math.ceil(file.size / numCores);
     const chunks = [];
     for (let i = 0; i < numCores; i++) {
         const start = i * chunkSize;
         const end = (start + chunkSize >= file.size) ? file.size : start + chunkSize;
         chunks.push(file.slice(start, end));
     }
 
     const workers = [];
     const results = new Array(numCores);
     let completed = 0;
     const existingChunks = await getExistingChunks(file.name);
     for (let index = 0; index < chunks.length; index++) {
        const existingChunk = existingChunks.find(chunk => chunk.index === index);
        if (existingChunk) {
            console.log(`Skipping chunk ${index} with hash ${existingChunk.hash}`);
            results[index] = existingChunk.hash; // 从服务器已存在的分片中获取哈希值
            completed++;
            if (completed === numCores) {
                proceedWithUploadAndMerge(file, chunks, results, path);
            }
            continue; // 跳过当前一次循环
        }
       let chunk =  chunks[index]
         const worker = new Worker('./worker.js');
         worker.postMessage(chunk);
         worker.onmessage = function(event) {
             results[index] = event.data;
             completed++;
             if (completed === numCores) {
                proceedWithUploadAndMerge(file, chunks, results, path)
             }
             worker.terminate();
         };
         worker.onerror = function(error) {
             console.error('Worker错误：', error.message);
             path.innerHTML = "生成MD5值时出错";
             worker.terminate();
         };
         workers.push(worker);
     };
}


async function proceedWithUploadAndMerge(file, chunks, results, path) {
    const spark = new SparkMD5.ArrayBuffer();
    for (let hash of results) {
        spark.append(hash);
    }
    const combinedHash = spark.end();
    path.innerHTML = "生成的MD5值为：" + combinedHash;

    // 上传每个分片
    path.innerHTML = "分片上传开始...";
    const existingChunks = await getExistingChunks(file.name);
    const uploadPromises = chunks.map((chunk, i) => {
        if (!existingChunks.some(chunk => chunk.index === i)) {
            return uploadChunk(chunk, i, file.name, results[i]);
        }
    }).filter(Boolean); // 过滤掉undefined的项
    Promise.all(uploadPromises).then(() => {
        path.innerHTML = "分片上传结束";
        path.innerHTML = "合并分片开始...";
        // 调用合并接口
        mergeChunks(file.name, combinedHash).then(res => {
            path.innerHTML = "合并分片完成，文件上传成功：" + JSON.stringify(res);
        }).catch(error => {
            console.error('合并错误：', error);
            path.innerHTML = "合并文件时出错";
        });
    }).catch(error => {
        console.error('上传错误：', error);
        path.innerHTML = "上传文件时出错";
    });
}
// 检查服务器上已经存在的分片
async function getExistingChunks(fileName) {
    const response = await fetch(`http://localhost:3000/existing-chunks?fileName=`+fileName);
    const data = await response.json();
    return data.existingChunks; // 返回已存在的分片索引
}

function uploadChunk(chunk, index, fileName, chunkHash) {
    console.log(`Uploading chunk ${index} with hash ${chunkHash}`);
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('index', index);
    formData.append('fileName', fileName);
    formData.append('chunkHash', chunkHash); // 传递每个分片的MD5哈希值
    return fetch('http://localhost:3000/upload', {
        method: 'POST',
        body: formData
    }).then(response => response.json());
}

function mergeChunks(fileName, combinedHash ) {
    console.log(`Requesting merge with combinedHash: ${combinedHash}`);
    return fetch('http://localhost:3000/merge', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileName, combinedHash  }) // 传递最终的combinedHash
    }).then(response => response.json());
}



function getFileMd5(file, callback) {
    var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice,
        chunkSize = 2097152, // Read in chunks of 2MB
        chunks = Math.ceil(file.size / chunkSize),
        currentChunk = 0,
        spark = new SparkMD5.ArrayBuffer(),
        fileReader = new FileReader();

    fileReader.onload = function(e) {
        spark.append(e.target.result); // Append array buffer
        currentChunk++;

        if (currentChunk < chunks) {
            loadNext();
        } else {
            callback(spark.end());
        }
    };

    fileReader.onerror = function() {
        console.warn('Oops, something went wrong.');
    };

    function loadNext() {
        var start = currentChunk * chunkSize,
            end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;

        fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }

    loadNext();
}