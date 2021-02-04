import glslangModule from '../glslang';

export const title = 'drawIndexed';
export const description = `根据顶点索引进行绘制`;

export async function init(canvas: HTMLCanvasElement, useWGSL: boolean) {
  //获取显卡适配器
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance'
  });
  //获取设备
  const device = await adapter.requestDevice();
  //该模块用于将glsl转spir_v
  const glslang = await glslangModule();
  //获取gpu交互上下文
  const context = canvas.getContext("gpupresent");
  // 交换链，用于显卡往显示器输出图像
  const swapChainFormat = "bgra8unorm";
  const swapChain = context.configureSwapChain({
    device,
    format: swapChainFormat,
  });


  //绘制顶点数据
  const vertexArray = new Float32Array([
    -0.5, -0.5,
    0.5, -0.5,
    0.5, 0.5,
    -0.5, 0.5
  ]);
  const triangleIndex = new Uint32Array([ 0, 1, 3, 1, 3, 2]);


  const verticesBuffer = device.createBuffer({
    size: vertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,//声明buffer用途，用于顶点
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(vertexArray);
  verticesBuffer.unmap();


  const indexsBuffer = device.createBuffer({
    size: triangleIndex.byteLength,
    usage: GPUBufferUsage.INDEX,//声明buffer用途，用于顶点索引
    mappedAtCreation: true,
  });
  new Uint32Array(indexsBuffer.getMappedRange()).set(triangleIndex);
  indexsBuffer.unmap();


  //渲染管线
  const pipeline = device.createRenderPipeline({
    vertexStage: {
      module: useWGSL
        ? device.createShaderModule({
          code: wgslShaders.vertex,
        })
        : device.createShaderModule({
          code: glslShaders.vertex,
          transform: (glsl) => glslang.compileGLSL(glsl, "vertex"),
        }),
      entryPoint: "main",
    },
    fragmentStage: {
      module: useWGSL
        ? device.createShaderModule({
          code: wgslShaders.fragment,
        })
        : device.createShaderModule({
          code: glslShaders.fragment,
          transform: (glsl) => glslang.compileGLSL(glsl, "fragment"),
        }),
      entryPoint: "main",
    },
    // 绘制模式
    /*
    enum GPUPrimitiveTopology {
      "point-list",
      "line-list",
      "line-strip",
      "triangle-list",
      "triangle-strip"
    };

    */
    primitiveTopology: "triangle-list",
    vertexState: {
      vertexBuffers: [
        {
          /*步进值，也就是每个顶点需要占用几个储存空间，单位是 byte。
          我们是用 Float32Array 来储存顶点位置的，每个 32 位浮点数需要 4 个 byte；
          xyz三维顶点需要 3 个 32 位浮点数来分别表示，即 4 * 3 byte。
          xy二维顶点需要2个32 位浮点数来分别表示，即 4 * 2 个 byte。
          */
          arrayStride: 4 * 2,
          attributes: [
            {
              // position
              //对应顶点着色器中 layout(location = 0)
              shaderLocation: 0,
              //0代表从头开始
              offset: 0,
              //2个32位浮点数，float3代表3个浮点数
              format: "float2",
            }
          ],
        },
      ],
    },
    colorStates: [
      {
        format: swapChainFormat,
      },
    ],
    //vertexState 设定用于顶点缓存的一些描述信息，例如格式、长度、位移等
    //layout 用于将 CPU 端的资源，也就是 JavaScript 中的资源，绑定到 GPU 端的
  });




  function frame() {
    const commandEncoder = device.createCommandEncoder();
    // 获取当前纹理图像
    const textureView = swapChain.getCurrentTexture().createView();

    // 渲染通道描述
    const renderPassDescriptor: GPURenderPassDescriptor = {
      // 存储图像信息
      colorAttachments: [
        {
          // 指定存储图像的位置
          attachment: textureView,
          // 背景颜色
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          // storeOp 存储选型  store 或 clear
          // resolveTarget 多重采样
        },
      ],
    };

    //开启一个渲染通道
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    //默认会开启一个视口viewport，宽高就是canvas的width height而不是clientwidth,clientheight
    //设置 渲染管线
    passEncoder.setPipeline(pipeline);
    //设置顶点
    passEncoder.setVertexBuffer(0, verticesBuffer);
    //设置顶点索引
    passEncoder.setIndexBuffer(indexsBuffer, 'uint32');
    passEncoder.drawIndexed(triangleIndex.length, 1, 0, 0, 0);

    passEncoder.endPass();
    device.queue.submit([commandEncoder.finish()]);
  }

  return frame;
}

export const glslShaders = {
  vertex: `#version 450
  layout(location = 0) in vec2 aVertexPosition;
  void main() {
    gl_Position = vec4(aVertexPosition, 0.0, 1.0);
  }
`,

  fragment: `#version 450
  layout(location = 0) out vec4 outColor;
  void main() {
    outColor=vec4(1.0,0.0,0.0,1.0);
  }
`,
};

export const wgslShaders = {
  vertex: `
  [[location(0)]] var<in> aVertexPosition : vec2<f32>;
  [[builtin(position)]] var<out> Position : vec4<f32>;

  [[stage(vertex)]]
  fn main() -> void {
    Position = vec4<f32>(aVertexPosition, 0.0, 1.0);
    return;
  }
`,
  fragment: `
  // 定义输出变量
  [[location(0)]] var<out> outColor : vec4<f32>;
  [[stage(fragment)]]
  fn main() -> void {
    outColor=vec4<f32>(1.0,0.0,0.0,1.0);
    return;
  }`
};
