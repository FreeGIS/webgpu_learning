import glslangModule from '../glslang';
import { createBuffer }from '../gpuEngine';
export const title = 'Hello Triangle';
export const description = '渲染一个基本的三角形，WebGPU入门，练习熟悉基本的GPU对象及渲染基本步骤。';

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

  //测试三角形
  const vertexArray = new Float32Array([
    0.0, 0.5,
    -0.5, -0.5,
    0.5, -0.5
  ]);
  const verticesBuffer = createBuffer(device,vertexArray,GPUBufferUsage.VERTEX);
  
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
          loadValue: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 },
          // storeOp 存储选型  store(默认) 或 clear
          // resolveTarget 多重采样
        },
      ],
    };

    //开启一个渲染通道
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    //默认会开启一个视口viewport，宽高就是canvas的width height而不是clientwidth,clientheight
    //设置 渲染管线
    passEncoder.setPipeline(pipeline);

    
    passEncoder.setVertexBuffer(0, verticesBuffer);

    passEncoder.draw(3, 1, 0, 0);
    passEncoder.endPass();

    device.defaultQueue.submit([commandEncoder.finish()]);
  }

  return frame;
}

export const glslShaders = {
  vertex: `#version 450
  layout(location = 0) in vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`,

  fragment: `#version 450
  layout(location = 0) out vec4 outColor;
  void main() {
      outColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
`,
};

export const wgslShaders = {
  vertex: `
[[location(0)]] var<in> a_position : vec2<f32>;
# 内置变量，等同于webgl的gl_Position ,wgsl注释以 # 标记，该着色器没有多行注释
[[builtin(position)]] var<out> Position : vec4<f32>;
[[stage(vertex)]]
fn main() -> void {
  Position = vec4<f32>(a_position, 0.0, 1.0);
  return;
}
`,
  fragment: `
[[location(0)]] var<out> outColor : vec4<f32>;

[[stage(fragment)]]
fn main() -> void {
  outColor = vec4<f32>(1.0, 0.0, 0.0, 1.0);
  return;
}
`,
};
