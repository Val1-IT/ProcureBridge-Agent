import type {Metadata} from 'next';
import {AlexaSimulator} from '../../../components/dealtwin/alexa-simulator';
export const metadata:Metadata={title:'DealTwin Voice'};
export default function VoicePage(){return <AlexaSimulator variant="voice"/>;}
