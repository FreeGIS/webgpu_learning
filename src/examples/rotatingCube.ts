import { mat4, vec3 } from 'gl-matrix';
import { cubeVertexArray, cubeVertexSize, cubeColorOffset, cubePositionOffset } from '../cube';
import glslangModule from '../glslang';

export const title = 'Rotating Cube';
export const description = '本节知识点是如何设置并更新unifomr，并设置深度测试等参数解释';

export async function init(canvas: HTMLCanvasElement, useWGSL: boolean) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();

  //创建透视投影
  const aspect = Math.abs(canvas.width / canvas.height);
  let projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);

  const context = canvas.getContext("gpupresent");

  const swapChain = context.configureSwapChain({
    device,
    format: "bgra8unorm",
  });

  //创建cube顶点 6个面，每个面2个三角形（2*3顶点数），共6*6=36个顶点
  const verticesBuffer = device.createBuffer({
    size: cubeVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
  verticesBuffer.unmap();

  //创建渲染管道
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

    primitiveTopology: "triangle-list",
    depthStencilState: {
      //开启深度测试
      depthWriteEnabled: true,
      //设置比较函数为less，
      depthCompare: "less",
      //设置depth为24bit
      format: "depth24plus-stencil8",
    },
    vertexState: {
      vertexBuffers: [
        {
          arrayStride: cubeVertexSize,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: cubePositionOffset,
              format: "float4",
            },
            {
              // color
              shaderLocation: 1,
              offset: cubeColorOffset,
              format: "float4",
            },
          ],
        },
      ],
    },
    //开启面剔除，默认是
    rasterizationState: {
      //frontFace: "ccw", 默认是ccw，即逆时针为正面，反面剔除
      cullMode: "back",
    },

    colorStates: [
      {
        format: "bgra8unorm",
      },
    ],
  });

  const depthTexture = device.createTexture({
    size: {
      width: canvas.width,
      height: canvas.height,
      depth: 1,
    },
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.OUTPUT_ATTACHMENT,
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        // attachment is acquired and set in render loop.
        attachment: undefined,
        //清除画布
        loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }
           // storeOp 存储选型  store(默认) 或 clear
           //storeOp如果为“store”，意思是渲染后保存被渲染的内容到内存中，后面可以被读取；
          //如果为“clear”，意思是渲染后清空内容。
      },
    ],
    depthStencilAttachment: {
      //深度测试渲染后保留内容存在depthTexture中，必填
      attachment: depthTexture.createView(),
      /* depthCompare: "less",则在深度测试时，gpu会将fragment的z值（范围为[0.0-1.0]）与
      这里设置的depthLoadValue值（这里为1.0）比较。其中使用depthCompare定义的函数（
      这里为less，意思是所有z值大于等于1.0的fragment会被剔除）进行比较。*/
      depthLoadValue: 1.0,
      depthStoreOp: "store",//渲染后保留深度
      stencilLoadValue: 0,
      stencilStoreOp: "store",//渲染后保留模板
    },
  };

  const uniformBufferSize = 4 * 16; // 4x4 matrix

  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
    ],
  });

  //get mvp 矩阵
  function getTransformationMatrix() {
    let viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -5));
    let now = Date.now() / 1000;
    mat4.rotate(
      viewMatrix,
      viewMatrix,
      1,
      vec3.fromValues(Math.sin(now), Math.cos(now), 0)
    );

    let modelViewProjectionMatrix = mat4.create();
    mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);

    return modelViewProjectionMatrix as Float32Array;
  }

  return function frame() {
    const transformationMatrix = getTransformationMatrix();
    //本节注意点，如何更新uniform
    device.defaultQueue.writeBuffer(
      uniformBuffer,
      0,
      transformationMatrix.buffer,
      transformationMatrix.byteOffset,
      transformationMatrix.byteLength
    );



    renderPassDescriptor.colorAttachments[0].attachment = swapChain
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.draw(36, 1, 0, 0);
    passEncoder.endPass();
    device.defaultQueue.submit([commandEncoder.finish()]);
  };
}

export const glslShaders = {
  vertex: `#version 450
layout(set = 0, binding = 0) uniform Uniforms {
  mat4 modelViewProjectionMatrix;
} uniforms;

layout(location = 0) in vec4 position;
layout(location = 1) in vec4 color;

layout(location = 0) out vec4 fragColor;

void main() {
  gl_Position = uniforms.modelViewProjectionMatrix * position;
  fragColor = color;
}
`,

  fragment: `#version 450
layout(location = 0) in vec4 fragColor;
layout(location = 0) out vec4 outColor;

void main() {
  outColor = fragColor;
}
`,
};

export const wgslShaders = {
  vertex: `
[[block]] struct Uniforms {
  [[offset(0)]] modelViewProjectionMatrix : mat4x4<f32>;
};

[[binding(0), set(0)]] var<uniform> uniforms : Uniforms;

[[location(0)]] var<in> position : vec4<f32>;
[[location(1)]] var<in> color : vec4<f32>;

[[builtin(position)]] var<out> Position : vec4<f32>;
[[location(0)]] var<out> fragColor : vec4<f32>;

[[stage(vertex)]]
fn main() -> void {
  Position = uniforms.modelViewProjectionMatrix * position;
  fragColor = color;
  return;
}
`,
  fragment: `
[[location(0)]] var<in> fragColor : vec4<f32>;
[[location(0)]] var<out> outColor : vec4<f32>;

[[stage(fragment)]]
fn main() -> void {
  outColor = fragColor;
  return;
}
`,
};
