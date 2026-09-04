import { useState, useEffect, useRef } from 'react';

interface UseTypewriterOptions {
  speed?: number;
  startDelay?: number;
}

export function useTypewriter(
  text: string,
  { speed = 38, startDelay = 600 }: UseTypewriterOptions = {}
) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    indexRef.current = 0;

    const delayTimer = setTimeout(() => {
      const interval = setInterval(() => {
        if (indexRef.current < text.length) {
          indexRef.current++;
          setDisplayed(text.slice(0, indexRef.current));
        } else {
          setDone(true);
          clearInterval(interval);
        }
      }, speed);

      return () => clearInterval(interval);
    }, startDelay);

    return () => clearTimeout(delayTimer);
  }, [text, speed, startDelay]);

  return { displayed, done };
}
