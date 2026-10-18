import {runBenchmarkCommand} from './report';
try{await runBenchmarkCommand(process.argv.slice(2));}
catch(error){console.error('BENCHMARK_FAILED',error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'):'UNEXPECTED_FAILURE');process.exitCode=1;}
