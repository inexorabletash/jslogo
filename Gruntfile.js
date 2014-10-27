module.exports = function(grunt) {
  // Project configuration.
  grunt.initConfig({
    wiredep: {
      task: {
        src: ['index.htm']
      }
    },
    bower: {
      options: {
        targetDir: "bower_components"
      },
      update: {}
    }
  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-wiredep');
  grunt.loadNpmTasks('grunt-bower-task');

  // Default task(s).
  grunt.registerTask('default', ['bower:update', 'wiredep']);

};
