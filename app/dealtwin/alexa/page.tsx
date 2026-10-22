import type {Metadata} from 'next';
import {AlexaSimulator} from '../../../components/dealtwin/alexa-simulator';
export const metadata:Metadata={title:'Alexa+ simulator'};
export default function AlexaPage(){return <AlexaSimulator/>;}
