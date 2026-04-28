/**
 * PostCSS Configuration
 * Minificação e otimização de CSS para produção
 */
module.exports = {
  plugins: {
    // Adiciona prefixos de navegadores automaticamente
    autoprefixer: {
      overrideBrowserslist: [
        '> 1%',
        'last 2 versions',
        'not dead',
        'not ie <= 11'
      ]
    },
    // Minifica e otimiza CSS
    cssnano: {
      preset: [
        'default',
        {
          discardComments: {
            removeAll: true // Remove todos os comentários
          },
          normalizeWhitespace: true, // Remove espaços desnecessários
          colormin: true, // Otimiza cores
          minifyFontValues: true, // Otimiza valores de fonte
          minifySelectors: true, // Otimiza seletores
          reduceTransforms: true, // Otimiza transforms
          mergeLonghand: true, // Mescla propriedades longhand
          mergeRules: true, // Mescla regras duplicadas
          discardDuplicates: true, // Remove duplicatas
          discardEmpty: true, // Remove regras vazias
          convertValues: true, // Converte valores para formatos menores
          calc: true // Calcula valores calc()
        }
      ]
    }
  }
};
