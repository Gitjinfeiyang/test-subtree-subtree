#!/usr/bin/env node

// import {fatal,success} from '@music/mill-exec'
import path from 'path'
import fs from 'fs'
import {exec} from 'child_process'

const fatal = (message) => {
    console.error(message);
    process.exit(1)
}

const success = (message) => {
    console.log(message)
}

// const cwd = process.env.MILL_SOURCE_CODE 
// process.chdir(cwd);
const cwd = process.cwd()
const tempDir = '.subtree-temp-directory'
const subtreercPath = path.resolve(cwd,'subtreerc.json');
let subtreeConfig = null;

function execAsync(commands,{
    cwd
}){
    return new Promise((resolve,reject) => {
        exec(
            commands.join(' & '),
            {
                cwd,
            },
            (error, stdout, stderr) => {
                if (error) {
                    console.error('Error: ',error)
                    reject(error)
                } else {
                    console.log(stdout)
                    resolve(stdout,stderr)
                }
            },
        );
    })
}

async function main(){

    // 读取rc文件
    try{
      const res = fs.readFileSync(subtreercPath,{encoding:'utf-8'});
      subtreeConfig = JSON.parse(res)
    
    }catch(err){
      console.error(err);
      process.exit(1);
    }

    await execAsync([`git --version`], {cwd:cwd})

    subtreeConfig.subtree.forEach(async (subtree) => {
        const mainBranch = subtree.mainBranch || 'master'
        const subtreeRoot = path.resolve(cwd,subtree.path);
        // const subtreeGitConfig = path.resolve(subtreeRoot, '.git');
        const projectName = (await execAsync(['basename `git rev-parse --show-toplevel`'],{cwd:cwd})).replace('\n','');
        const subtreeProjectName = subtree.remote.split('/').pop().replace('.git','');
        const mainProjectBranchName = await execAsync(['git symbolic-ref --short HEAD'],{cwd:cwd});
        const branchName = `${projectName}/${mainProjectBranchName.replace('/','-').replace('\n','')}`
        const subtreeCWD = path.resolve(cwd,'../',tempDir,subtree.path)
        
        // // 先push到subtree仓库新分支
        // await execAsync([`git subtree push --prefix=${subtree.path} ${subtree.remote} ${branchName}`], {cwd:cwd})

        console.log(subtreeCWD)
        await execAsync([`rm -rf ${tempDir}`], {cwd:path.resolve(cwd,'../')})

        await execAsync([`mkdir ${tempDir}`], {cwd:path.resolve(cwd,'../')});

        await execAsync([`cp -r ${subtree.path} ../${tempDir}`], {cwd})

        await execAsync([
            'git init',
        ],{cwd:subtreeCWD})
        await execAsync([
            `git remote add origin ${subtree.remote}`,
        ],{cwd:subtreeCWD})
        await execAsync([
            'git fetch',
        ],{cwd:subtreeCWD})

        await execAsync([
            `git checkout -b ${branchName}`,
            'git add .',
            `git commit -m "script: init subtree" -n`,
            // 'git pull origin master --allow-unrelated-histories',
            `git push origin HEAD:${branchName}`,
        ],{cwd:subtreeCWD})
        // clone 
        // await execAsync([`git clone ${subtree.remote}`],{cwd:path.resolve(cwd,tempDir)})

        // await execAsync([`git checkout ${branchName}`],{cwd:subtreeCWD})
        await execAsync([`git fetch`],{cwd:subtreeCWD})

        // 检查是否落后master分支
        const revResult = await execAsync([`git rev-list --left-right --count origin/${mainBranch}...@ | cut -f1`],{cwd:subtreeCWD})
        if(Number(revResult) > 0){
            // console.log('========== subtree落后主分支，尝试同步最新代码 ===========')
            // 尝试同步最新代码
            // try{
            //     await execAsync(['git pull origin main --allow-unrelated-histories'],{cwd:subtreeRoot})
            // }catch(err){
              fatal('========== subtree落后主分支，请同步最新代码 ===========')
            // }
        } else {
            console.log('========== subtree代码已同步最新 ===========')
        }

        // 检查是否master是否落后当前分支，即当前分支是否合入master
        await execAsync([`git checkout ${mainBranch}`],{cwd:subtreeCWD})
        const revMasterResult = await execAsync([`git rev-list --left-right --count origin/${branchName}...@ | cut -f1`],{cwd:subtreeCWD})
        if(Number(revMasterResult) > 0){
            fatal('========== subtree未合入主分支 ===========')
        } else {
            console.log('========== subtree代码已同步到主分支 ===========')
        }

        // 最新的则删除新创建的分支
        await execAsync([`git push origin ${branchName} -d`])
        success('======= subtree检查通过 ========')
    })
}

main()