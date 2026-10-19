import type { ComponentProps } from "react";
export default function Image({fill, priority, unoptimized, ...props}: Omit<ComponentProps<"img">, "src"> & {src: string; fill?: boolean; priority?: boolean; unoptimized?: boolean}) {return <img {...props} style={fill ? {position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",...props.style}: props.style}/>;}
