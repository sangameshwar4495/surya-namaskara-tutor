import {useCallback,useEffect,useRef,useState} from 'react';
import * as Speech from 'expo-speech';

/**
 * One cancellable narration at a time; never leave queued advice playing on another pose.
 * `speak` resolves `true` when the whole text was spoken, or `false` when it was muted,
 * cancelled (stop/new narration/navigation) or the device speech engine failed. It always
 * settles, so callers can sequence what happens after the narration.
 */
export function useCoachSpeech(focused:boolean) {
  const [enabled,setEnabled]=useState(true);
  const [speaking,setSpeaking]=useState(false);
  const [error,setError]=useState('');
  const generation=useRef(0);
  const allowed=useRef(false);allowed.current=focused && enabled;
  const voices=useRef<Promise<Speech.Voice[]>|null>(null);
  const pending=useRef<((spoken:boolean)=>void)|null>(null);
  const settle=useCallback((spoken:boolean)=>{const resolve=pending.current;pending.current=null;resolve?.(spoken);},[]);
  const stop=useCallback(()=>{
    generation.current++;setSpeaking(false);settle(false);
    void Speech.stop().catch(()=>{});
  },[settle]);
  useEffect(()=>{
    voices.current=Speech.getAvailableVoicesAsync().catch(()=>[]);
    return ()=>{generation.current++;settle(false);void Speech.stop().catch(()=>{});};
  },[settle]);
  useEffect(()=>{if(!focused || !enabled)stop();},[focused,enabled,stop]);
  const speak=useCallback((text:string)=>new Promise<boolean>(resolve=>{
    settle(false); // a newer narration cancels the previous one
    const token=++generation.current;
    if(!allowed.current){resolve(false);return;}
    pending.current=resolve;
    const finish=(spoken:boolean)=>{if(token===generation.current){setSpeaking(false);settle(spoken);}};
    void (async()=>{
      try {
        await Speech.stop();
        const list=await (voices.current??Promise.resolve([]));
        if(token!==generation.current || !allowed.current){finish(false);return;}
        const english=list.filter(v=>v.language.toLowerCase().startsWith('en'));
        const voice=english.find(v=>v.quality===Speech.VoiceQuality.Enhanced && /^en[-_]IN$/i.test(v.language))
          ??english.find(v=>v.quality===Speech.VoiceQuality.Enhanced)
          ??english.find(v=>/^en[-_]IN$/i.test(v.language))??english[0];
        // Short chunks stay under native TTS limits without dropping any feedback.
        const sentences=text.match(/[^.!?]+[.!?]?/g)??[text];
        const chunks:string[]=[];
        for(const sentence of sentences) {
          const last=chunks.length-1;
          if(last>=0 && chunks[last].length+sentence.length<700)chunks[last]+=sentence;
          else chunks.push(sentence);
        }
        setError('');setSpeaking(true);
        const play=(index:number)=>{
          if(token!==generation.current || !allowed.current){finish(false);return;}
          if(index===chunks.length){finish(true);return;}
          Speech.speak(chunks[index],{voice:voice?.identifier,language:voice?.language??'en-IN',rate:.88,pitch:1,
            onDone:()=>play(index+1),
            onError:()=>{if(token===generation.current)setError('Voice guidance is unavailable. Please use the written instructions.');finish(false);},
            onStopped:()=>finish(false),
          });
        };
        play(0);
      } catch {
        if(token===generation.current)setError('Voice guidance is unavailable. Please use the written instructions.');
        finish(false);
      }
    })();
  }),[settle]);
  return {enabled,setEnabled,speaking,error,speak,stop};
}
