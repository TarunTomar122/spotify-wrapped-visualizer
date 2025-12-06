varying vec2 vUv;
varying float vVisibility;
varying vec4 vTextureCoords;
varying float vInstanceId;

uniform sampler2D uWrapperTexture;
uniform sampler2D uAtlas;
uniform sampler2D uBlurryAtlas;
uniform float uActiveAlbum;
uniform float uGlowIntensity;



void main()
{            
                    
    vec4 texel = texture2D(uWrapperTexture, vUv);

    
    if(texel.a==0.) discard;
            


    // Get UV coordinates for this image from the uniform array
    float xStart = vTextureCoords.x;
    float xEnd = vTextureCoords.y;
    float yStart = vTextureCoords.z;
    float yEnd = vTextureCoords.w;

     vec2 atlasUV = vec2(
        mix(xStart, xEnd, vUv.x),
        mix(yStart, yEnd, (1.-vUv.y)*1.5)
    );     

    
    vec4 blurryTexel = texture2D(uBlurryAtlas, atlasUV);

    // Sample the texture
    vec4 color = texel.b<0.02 ? texture2D(uAtlas, atlasUV) : texel + blurryTexel*0.8;

    color.a *= vVisibility;

    // Add glow effect for active album
    // Calculate the album index for this instance (100 albums, repeating)
    float albumIndex = mod(vInstanceId, 100.0);
    
    if (uActiveAlbum >= 0. && abs(albumIndex - uActiveAlbum) < 0.5) {
        // Create a pulsing glow effect
        float glowPulse = 0.7 + 0.3 * sin(vInstanceId * 0.1);
        vec3 glowColor = vec3(0.3, 0.8, 1.0); // Cyan glow
        
        // Add glow to the color
        color.rgb += glowColor * uGlowIntensity * glowPulse;
        
        // Slightly brighten the entire album
        color.rgb *= 1.2;
    }

    color.r = min(color.r, 1.);
    color.g = min(color.g, 1.);
    color.b = min(color.b, 1.);

    gl_FragColor = color;
}