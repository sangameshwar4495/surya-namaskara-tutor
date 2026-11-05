import React,{useEffect,useState} from 'react';
import {StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {useVideoPlayer,VideoView} from 'expo-video';

/**
 * Corner demonstration over the camera preview. Its size is limited in both directions so a
 * tall clip cannot cover the user's body; tapping moves it to the opposite corner.
 */
export default function MovementDemo({source,aspectRatio,playing,frame}:{
  source:number;aspectRatio:number;playing:boolean;frame:{width:number;height:number};
}) {
  const [corner,setCorner]=useState<'top'|'bottom'>('bottom');
  const [error,setError]=useState(false);
  const player=useVideoPlayer(source,p=>{p.loop=true;p.muted=true;p.audioMixingMode='mixWithOthers';});
  useEffect(()=>{if(playing)player.play();else player.pause();},[player,playing]);
  useEffect(()=>{const subscription=player.addListener('statusChange',event=>setError(event.status==='error'));return()=>subscription.remove();},[player]);
  const aspect=Math.max(.4,Math.min(2.5,aspectRatio));
  const maxWidth=Math.min(200,frame.width*.34), maxHeight=frame.height*.34;
  const width=Math.max(72,Math.min(maxWidth,maxHeight*aspect));
  if(frame.width<=0 || frame.height<=0)return null;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Demonstration video. Tap to move it to the other corner."
    activeOpacity={.85} onPress={()=>setCorner(v=>v==='bottom'?'top':'bottom')}
    style={[styles.box,{width},corner==='bottom'?styles.bottom:styles.top]}>
    {error?<Text style={styles.label}>Demo unavailable</Text>:<VideoView player={player} style={{width:'100%',aspectRatio:aspect}}
      contentFit="contain" nativeControls={false} surfaceType="textureView" allowsPictureInPicture={false} pointerEvents="none" />}
  </TouchableOpacity>;
}
const styles=StyleSheet.create({
  box:{position:'absolute',borderRadius:10,overflow:'hidden',backgroundColor:'#10251f',borderWidth:1,borderColor:'#ffffff88'},
  bottom:{bottom:10,right:10},top:{top:10,left:10},
  label:{color:'white',fontSize:11,textAlign:'center',padding:8},
});
