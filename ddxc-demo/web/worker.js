importScripts('spark-md5.min.js');

onmessage = function(event) {
    const fileReader = new FileReader();
    fileReader.onload = function(e) {
        const buffer = e.target.result;
        const hash = SparkMD5.ArrayBuffer.hash(buffer);
        postMessage(hash);
    };
    fileReader.readAsArrayBuffer(event.data);
};