export function createBuffer(device,dataArray,usage){
    const buffer = device.createBuffer({
        size: dataArray.byteLength,
        usage: usage,
        mappedAtCreation: true,
      });
      new Float32Array(buffer.getMappedRange()).set(dataArray);
      buffer.unmap();
      return buffer;
}