import cheerio from 'cheerio'
import path from 'path'
import git from './git'
import { fs, ncp, reread } from './libs'
import { encapsulateCSS } from './utils'
import { ViewWriter, ScriptWriter, StyleWriter } from './writers'

export const transpile = async (config) => {
  let inputFiles
  let outputFiles = []

  await Promise.all([
    fs.readdir(config.input).then((files) => {
      inputFiles = files
    }),
    git.removeAppfairyFiles().then((files) => {
      outputFiles.push(...files)
    }),
  ])

  const htmlFiles = inputFiles.filter(file => path.extname(file) == '.html')
  const publicSubDirs = inputFiles.filter(file => !path.extname(file))

  const scriptWriter = new ScriptWriter({
    baseUrl: config.input,
    prefetch: config.prefetch,
  })

  const styleWriter = new StyleWriter({
    baseUrl: config.input,
    prefetch: config.prefetch,
    source: config.srouce,
  })

  const transpilingHTMLFiles = htmlFiles.map((htmlFile) => {
    return transpileHTMLFile(
      config,
      htmlFile,
      scriptWriter,
      styleWriter,
    )
  })

  const writingFiles = Promise.all(transpilingHTMLFiles).then((viewWriters) => {
    return Promise.all([
      ViewWriter.writeAll(
        viewWriters, config.output.src.views, config.output.src.controllers
      ).then((paths) => outputFiles.push(...paths)),
      scriptWriter.write(
        config.output.src.scripts
      ).then((paths) => outputFiles.push(...paths)),
      styleWriter.write(
        config.output.src.styles
      ).then((paths) => outputFiles.push(...paths)),
    ])
  })

  const makingPublicDir = makePublicDir(
    config,
    publicSubDirs,
  ).then((paths) => outputFiles.push(...paths))

  await Promise.all([
    writingFiles,
    makingPublicDir,
  ])

  return git.add(outputFiles).then((files) => {
    return git.commit(files, 'Migrate')
  })
}

const transpileHTMLFile = async (
  config,
  htmlFile,
  scriptWriter,
  styleWriter,
) => {
  const html = (await fs.readFile(`${config.input}/${htmlFile}`)).toString()
  const $ = cheerio.load(html)
  const $head = $('head')
  const $body = $('body')
  const dataAttrs = $(':root').data()

  const viewWriter = new ViewWriter({
    name: htmlFile.split('.').slice(0, -1).join('.'),
    baseUrl: config.baseUrl,
    source: config.source,
  })

  setScripts(scriptWriter, $head, $)
  setStyles(viewWriter, styleWriter, $head, $)
  setHTML(viewWriter, $body, $)
  setWfData(viewWriter, dataAttrs)

  return viewWriter
}

const makePublicDir = async (config, publicSubDirs) => {
  const publicDir = config.output.public

  await Promise.all(publicSubDirs.map((publicSubDir) => {
    return ncp(
      `${config.input}/${publicSubDir}`,
      `${publicDir}/${publicSubDir}`,
    )
  }))

  // Resolving relative paths
  const filePaths = await reread(config.input)

  const relativePaths = filePaths.map((filePath) => {
    const relativePath = path.relative(config.input, filePath)

    return `${publicDir}/${relativePath}`
  })

  // Encapsulate CSS files
  await Promise.all(relativePaths.map(async (relativePath) => {
    if (path.extname(relativePath) != '.css') return

    // Don't encapsulate normalize.css because it increases the
    // specificity of its selectors which might cause them to
    // override other styles.
    if (path.basename(relativePath) == 'normalize.css') return

    let css = (await fs.readFile(relativePath)).toString()
    css = encapsulateCSS(css, config.source)
    await fs.writeFile(relativePath, css)
  }))

  return relativePaths
}

const setScripts = (scriptWriter, $head) => {
  const $scripts = $head.find('script[type="text/javascript"]')

  $scripts.each((i, script) => {
    const $script = $head.find(script)

    scriptWriter.setScript($script.attr('src'), $script.html(), {
      isAsync: !!$script.attr('async'),
    })
  })
}

const setStyles = (viewWriter, styleWriter, $head) => {
  let $styles

  $styles = $head.find('link[rel="stylesheet"][type="text/css"]')

  $styles.each((i, style) => {
    const $style = $head.find(style)

    viewWriter.setStyle($style.attr('href'), $style.html())
    styleWriter.setStyle($style.attr('href'), $style.html())
  })

  $styles = $head.find('style')

  $styles.each((i, style) => {
    const $style = $head.find(style)

    viewWriter.setStyle($style.attr('href'), $style.html())
    styleWriter.setStyle($style.attr('href'), $style.html())
  })
}

const setHTML = (viewWriter, $body, $) => {
  // Create a wrap around $body so we can inherit its style without actually
  // using a <body> tag
  const $div = $('<div>')
  $div.html($body.html())
  $div.attr($body.attr())
  viewWriter.html = $.html($div)
}

const setWfData = (viewWriter, dataAttrs) => {
  viewWriter.wfData = dataAttrs
}
